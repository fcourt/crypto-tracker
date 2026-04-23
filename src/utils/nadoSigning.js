// utils/nadoSigning.js
//import { ethers } from 'ethers';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';

const NADO_GATEWAY = 'https://gateway.prod.nado.xyz/v1';
const CHAIN_ID     = 57073; // Ink Mainnet

// ─── Helpers ────────────────────────────────────────────────────────────────

// "default" → "64656661756c74" → padded à 12 bytes (24 hex chars)
export function buildSubaccount(address, name = 'default') {
  const addr    = address.toLowerCase().replace('0x', ''); // 40 hex chars

  const bytes   = new TextEncoder().encode(name);          // UTF-8 bytes
  const nameHex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .padEnd(24, '0')   // 12 bytes = 24 hex chars
    .slice(0, 24);

  return '0x' + addr + nameHex;                            // 64 hex chars total
}

// productId → adresse 20 bytes (verifyingContract pour place_order)
function productIdToAddress(productId) {
  return '0x' + productId.toString(16).padStart(40, '0');
}

// nonce = (now_ms + 50) << 20 | random_10_bits
function buildNonce() {
  const ms   = BigInt(Date.now() + 50);
  const rand = BigInt(Math.floor(Math.random() * 1024));
  return (ms << 20n) + rand;
}

// appendix standard : version=1, cross-margin, DEFAULT/IOC/FOK/POST_ONLY
function buildAppendix({ reduceOnly = false, orderType = 'DEFAULT' } = {}) {
  const orderTypeMap = { DEFAULT: 0n, IOC: 1n, FOK: 2n, POST_ONLY: 3n };
  const version = 1n;
  const ot      = orderTypeMap[orderType] ?? 0n;
  const ro      = reduceOnly ? 1n : 0n;
  // bits: [7..0]=version [8]=isolated [10..9]=orderType [11]=reduceOnly
  return version | (ot << 9n) | (ro << 11n);
}

// ─── Query helper (GET avec query string) ───────────────────────────────────

async function nadoQuery(params) {
  const qs  = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
  ).toString();
  const res = await fetch(`${NADO_GATEWAY}/query?${qs}`, {
    method:  'GET',
    headers: { 'Accept-Encoding': 'gzip' },
  });
  return res.json();
}

// ─── Récupère l'adresse endpoint (pour cancel, withdraw, etc.) ──────────────

let _endpointAddress = null;
async function getEndpointAddress() {
  if (_endpointAddress) return _endpointAddress;
  const data = await nadoQuery({ type: 'contracts' });
  _endpointAddress = data?.data?.endpoint;
  return _endpointAddress;
}

// ─── Signature EIP-712 ──────────────────────────────────────────────────────

/*
async function signTyped(agentPk, domain, types, value) {
  const wallet = new ethers.Wallet(agentPk);
  return wallet.signTypedData(domain, types, value);
}
*/

async function signTyped(agentPk, domain, types, value) {
  const account = privateKeyToAccount(agentPk);
  return account.signTypedData({ domain, types, primaryType: Object.keys(types)[0], message: value });
}

// ─── Place Order ─────────────────────────────────────────────────────────────

export async function placeNadoOrder({
  agentPk,
  address,
  subaccountName = 'default',
  productId,
  price,
  size,           // positif = buy, négatif = sell
  reduceOnly     = false,
  orderType      = 'DEFAULT',  // 'DEFAULT' | 'IOC' | 'FOK' | 'POST_ONLY'
  expirationSec,
}) {
  const sender     = buildSubaccount(address, subaccountName);
  const priceX18   = BigInt(Math.round(price * 1e18));
  const amountX18  = BigInt(Math.round(size  * 1e18));
  const expiration = BigInt(expirationSec ?? Math.floor(Date.now() / 1000) + 30 + 120);
  const nonce      = buildNonce();
  const appendix   = buildAppendix({ reduceOnly, orderType });

  const domain = {
    name:              'Nado',
    version:           '0.0.1',
    chainId:           CHAIN_ID,
    verifyingContract: productIdToAddress(productId),  // ← spécifique à place_order
  };

  const types = {
    Order: [
      { name: 'sender',     type: 'bytes32' },
      { name: 'priceX18',   type: 'int128'  },
      { name: 'amount',     type: 'int128'  },
      { name: 'expiration', type: 'uint64'  },
      { name: 'nonce',      type: 'uint64'  },
      { name: 'appendix',   type: 'uint128' },
    ],
  };

  const value = { sender, priceX18, amount: amountX18, expiration, nonce, appendix };

  const signature = await signTyped(agentPk, domain, types, value);

  const res = await fetch(`${NADO_GATEWAY}/execute`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'Accept-Encoding': 'gzip',
    },
    body: JSON.stringify({
      place_order: {
        product_id: productId,
        order: {
          sender,
          priceX18:   String(priceX18),
          amount:     String(amountX18),
          expiration: String(expiration),
          nonce:      String(nonce),
          appendix:   String(appendix),
        },
        signature,
      },
    }),
  });

  const data = await res.json();
  if (data.status !== 'success') throw new Error(`[Nado] ${data.error ?? 'place_order failed'}`);
  return data; // data.data.digest = order id
}

// ─── Cancel Orders ───────────────────────────────────────────────────────────

export async function cancelNadoOrders({
  agentPk,
  address,
  subaccountName = 'default',
  productIds,   // number[]
  digests,      // string[] (bytes32 hex, depuis data.data.digest de place_order)
}) {
  const sender   = buildSubaccount(address, subaccountName);
  const nonce    = buildNonce();
  const endpoint = await getEndpointAddress();  // verifyingContract = endpoint pour cancel

  const domain = {
    name:              'Nado',
    version:           '0.0.1',
    chainId:           CHAIN_ID,
    verifyingContract: endpoint,
  };

  const types = {
    Cancellation: [
      { name: 'sender',     type: 'bytes32'   },
      { name: 'productIds', type: 'uint32[]'  },
      { name: 'digests',    type: 'bytes32[]' },
      { name: 'nonce',      type: 'uint64'    },
    ],
  };

  const value     = { sender, productIds, digests, nonce };
  const signature = await signTyped(agentPk, domain, types, value);

  const res = await fetch(`${NADO_GATEWAY}/execute`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    body: JSON.stringify({
      cancel_orders: {
        sender,
        productIds,
        digests,
        nonce:     String(nonce),
        signature,
      },
    }),
  });

  const data = await res.json();
  if (data.status !== 'success') throw new Error(`[Nado] ${data.error ?? 'cancel failed'}`);
  return data;
}

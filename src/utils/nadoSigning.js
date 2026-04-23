// utils/nadoSigning.js
import { privateKeyToAccount } from 'viem/accounts';

const NADO_GATEWAY_PROXY = '/api/nado'; // POST proxy → gateway.prod.nado.xyz/v1/query
const NADO_EXECUTE       = 'https://gateway.prod.nado.xyz/v1/execute'; // exécution directe
const CHAIN_ID           = 57073; // Ink Mainnet

// ─── Helpers ────────────────────────────────────────────────────────────────

export function buildSubaccount(address, name = 'default') {
  const addr    = address.toLowerCase().replace('0x', '');
  const bytes   = new TextEncoder().encode(name);
  const nameHex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .padEnd(24, '0')
    .slice(0, 24);
  return '0x' + addr + nameHex;
}

function productIdToAddress(productId) {
  return '0x' + productId.toString(16).padStart(40, '0');
}

function buildAppendix({ reduceOnly = false, orderType = 'DEFAULT' } = {}) {
  const orderTypeMap = { DEFAULT: 0n, IOC: 1n, FOK: 2n, POST_ONLY: 3n };
  const version = 1n;
  const ot      = orderTypeMap[orderType] ?? 0n;
  const ro      = reduceOnly ? 1n : 0n;
  return version | (ot << 9n) | (ro << 11n);
}

// ─── Sync horloge avec le serveur Nado ──────────────────────────────────────
let _serverTimeOffsetMs = 0;

async function syncServerTime() {
  try {
    const t0   = Date.now();
    const res  = await fetch(NADO_GATEWAY_PROXY, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'server_time' }),
    });
    const t1   = Date.now();
    const data = await res.json();
    const serverMs = data?.data?.server_time;
    if (serverMs) {
      _serverTimeOffsetMs = serverMs - t1 + (t1 - t0) / 2;
      console.log(`[Nado] clock offset: ${_serverTimeOffsetMs}ms`);
    }
  } catch (e) {
    console.warn('[Nado] syncServerTime failed:', e.message);
  }
}

function serverNow() {
  return Date.now() + _serverTimeOffsetMs;
}

// ─── Nonce : recv_time en ms shiftée + 10 bits random ───────────────────────
function buildNonce() {
  const recvTime = BigInt(Math.floor(serverNow()) + 5000);
  const rand     = BigInt(Math.floor(Math.random() * 1024));
  return (recvTime << 20n) | rand;
}

// ─── Arrondi au tick price ───────────────────────────────────────────────────
export function roundToNadoPrice(price, priceIncrementX18) {
  const tickX18   = BigInt(priceIncrementX18);
  const priceX18  = BigInt(Math.round(price * 1e18));
  const remainder = priceX18 % tickX18;
  const half      = tickX18 / 2n;
  return remainder >= half ? priceX18 - remainder + tickX18 : priceX18 - remainder;
}

// ─── Arrondi au tick size ────────────────────────────────────────────────────
function roundToNadoSize(size, sizeIncrement) {
  const tickSz  = BigInt(sizeIncrement);
  const sizeX18 = BigInt(Math.round(size * 1e18));
  const rem     = sizeX18 % tickSz;
  const half    = tickSz / 2n;
  return rem >= half ? sizeX18 - rem + tickSz : sizeX18 - rem;
}

// ─── Signature EIP-712 ──────────────────────────────────────────────────────
async function signTyped(agentPk, domain, types, value) {
  const account = privateKeyToAccount(agentPk);
  return account.signTypedData({ domain, types, primaryType: Object.keys(types)[0], message: value });
}

// ─── Récupère l'adresse endpoint ────────────────────────────────────────────
let _endpointAddress = null;
async function getEndpointAddress() {
  if (_endpointAddress) return _endpointAddress;
  const res  = await fetch(NADO_GATEWAY_PROXY, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'contracts' }),
  });
  const data = await res.json();
  _endpointAddress = data?.data?.endpoint;
  return _endpointAddress;
}

// ─── Place Order ─────────────────────────────────────────────────────────────
export async function placeNadoOrder({
  agentPk,
  address,
  subaccountName    = 'default',
  productId,
  price,
  size,                                        // positif = buy, négatif = sell
  priceIncrementX18 = '1000000000000000000',
  sizeIncrement     = '1000000000000000',
  reduceOnly        = false,
  orderType         = 'DEFAULT',
  expirationSec,
}) {
  await syncServerTime();

  const sender     = buildSubaccount(address, subaccountName);
  const priceX18   = roundToNadoPrice(price, priceIncrementX18);         // ✅ arrondi tick price
  const amountX18  = roundToNadoSize(size, sizeIncrement);               // ✅ arrondi tick size — une seule déclaration
  const expiration = BigInt(expirationSec ?? Math.floor(serverNow() / 1000) + 150);
  const nonce      = buildNonce();
  const appendix   = buildAppendix({ reduceOnly, orderType });

  const domain = {
    name:              'Nado',
    version:           '0.0.1',
    chainId:           CHAIN_ID,
    verifyingContract: productIdToAddress(productId),
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

  const value     = { sender, priceX18, amount: amountX18, expiration, nonce, appendix };
  const signature = await signTyped(agentPk, domain, types, value);

  const res = await fetch(NADO_EXECUTE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
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
  return data;
}

// ─── Cancel Orders ───────────────────────────────────────────────────────────
export async function cancelNadoOrders({
  agentPk,
  address,
  subaccountName = 'default',
  productIds,
  digests,
}) {
  await syncServerTime();

  const sender   = buildSubaccount(address, subaccountName);
  const nonce    = buildNonce();
  const endpoint = await getEndpointAddress();

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

  const res = await fetch(NADO_EXECUTE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' },
    body: JSON.stringify({
      cancel_orders: { sender, productIds, digests, nonce: String(nonce), signature },
    }),
  });

  const data = await res.json();
  if (data.status !== 'success') throw new Error(`[Nado] ${data.error ?? 'cancel failed'}`);
  return data;
}

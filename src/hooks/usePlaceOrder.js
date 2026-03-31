import { privateKeyToAccount, createWalletClient, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { ec, Account, RpcProvider } from 'starknet';

const HL_EXCHANGE_API = 'https://api.hyperliquid.xyz/exchange';
const EXT_API_BASE    = '/api/extended';

// ─── Helpers HL ──────────────────────────────────────────────────────────────

function getAssetIndex(hlKey, coin) {
  // HL utilise un index numérique par coin — on le résout via l'API meta
  // Pour simplifier on utilise le coin string directement (HL accepte les deux)
  return coin;
}

async function signHLOrder({ agentPrivateKey, accountAddress, order, vaultAddress }) {
  const account = privateKeyToAccount(agentPrivateKey);

  const domain = {
    name:    'Exchange',
    version: '1',
    chainId: 42161, // Arbitrum
  };

  const types = {
    Agent: [
      { name: 'source',      type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };

  // Payload action
  const action = {
    type: 'order',
    orders: [{
      a:  order.assetIndex,
      b:  order.isBuy,
      p:  order.limitPrice.toFixed(order.pxDecimals ?? 2),
      s:  order.size.toFixed(order.szDecimals ?? 6),
      r:  false,
      t:  { limit: { tif: 'Gtc' } },
    }],
    grouping: 'na',
  };

  const nonce     = Date.now();
  const actionHash = await hashAction(action, nonce, vaultAddress);

  // Signature EIP-712
  const phantomAgent = {
    source:       'a',
    connectionId: actionHash,
  };

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'Agent',
    message:     phantomAgent,
  });

  return {
    action,
    nonce,
    signature: { r: signature.slice(0, 66), s: '0x' + signature.slice(66, 130), v: parseInt(signature.slice(130), 16) },
    vaultAddress: vaultAddress || null,
  };
}

// Hash keccak de l'action + nonce (compatible HL)
async function hashAction(action, nonce, vaultAddress) {
  const { keccak256, encodePacked, toBytes } = await import('viem');
  const actionBytes  = toBytes(JSON.stringify(action));
  const nonceBytes   = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce), false);
  const vaultBytes   = vaultAddress
    ? toBytes(vaultAddress)
    : new Uint8Array(1).fill(0);

  const packed = new Uint8Array([...actionBytes, ...nonceBytes, ...vaultBytes]);
  return keccak256(packed);
}

// ─── Helpers Extended ────────────────────────────────────────────────────────

async function signExtOrder({ starkPrivateKey, l2Vault, order, apiKey }) {
  const provider = new RpcProvider({
    nodeUrl: 'https://starknet-mainnet.public.blastapi.io',
  });

  const account = new Account(
    provider,
    '0x0', // adresse publique non requise pour signer
    starkPrivateKey
  );

  const now       = Date.now();
  const expiresAt = Math.floor(now / 1000) + 60 * 60; // 1h

  const orderMsg = {
    market:      order.market,
    side:        order.isBuy ? 'BUY' : 'SELL',
    type:        'LIMIT',
    size:        order.size.toFixed(order.szDecimals ?? 6),
    price:       order.limitPrice.toFixed(order.pxDecimals ?? 2),
    timeInForce: 'GTC',
    l2Vault:     l2Vault,
    expiresAt,
    nonce:       now,
  };

  // Signature SNIP-12
  const msgHash = ec.starkCurve.pedersen(
    BigInt(l2Vault),
    BigInt(now)
  );
  const { r, s } = ec.starkCurve.sign(msgHash.toString(), starkPrivateKey);

  return {
    ...orderMsg,
    signature: {
      r: '0x' + r.toString(16),
      s: '0x' + s.toString(16),
    },
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function usePlaceOrder() {
  const agentPrivateKey  = localStorage.getItem('hl_agent_pk')       || '';
  const hlAccountAddress = localStorage.getItem('hl_address')         || '';
  const hlVaultAddress   = localStorage.getItem('hl_vault_address')   || null;
  const starkPrivateKey  = localStorage.getItem('ext_stark_pk')       || '';
  const l2Vault          = localStorage.getItem('ext_l2_vault')       || '';
  const extApiKey        = (() => {
    try { return JSON.parse(localStorage.getItem('extended_api_keys') || '[]')[0]?.apiKey || ''; }
    catch { return ''; }
  })();

  /**
   * Place un ordre sur la plateforme donnée
   * @param {Object} params
   * @param {string} params.platformId   - 'hyperliquid' | 'xyz' | 'hyena' | 'extended'
   * @param {string} params.hlKey        - coin key HL (ex: 'BTC', 'xyz:ETH')
   * @param {string} params.extKey       - market key Extended (ex: 'BTC-USD-PERP')
   * @param {number} params.assetIndex   - index numérique HL du coin
   * @param {boolean} params.isBuy       - true = LONG, false = SHORT
   * @param {number} params.size         - taille en asset
   * @param {number} params.limitPrice   - prix limit
   * @param {number} params.pxDecimals   - décimales du prix
   * @param {number} params.szDecimals   - décimales de la size
   */
  const placeOrder = async (params) => {
    const { platformId, hlKey, extKey, assetIndex, isBuy, size, limitPrice, pxDecimals, szDecimals } = params;

    // ── Extended ──────────────────────────────────────────────────────────────
    if (platformId === 'extended') {
      if (!starkPrivateKey || !l2Vault) {
        throw new Error('Clé Stark ou l2Vault manquant pour Extended');
      }
      const payload = await signExtOrder({
        starkPrivateKey,
        l2Vault,
        order: { market: extKey, isBuy, size, limitPrice, pxDecimals, szDecimals },
        apiKey: extApiKey,
      });
      const res = await fetch(
        `${EXT_API_BASE}?endpoint=${encodeURIComponent('/api/v1/orders')}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': extApiKey },
          body:    JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `Extended HTTP ${res.status}`);
      }
      return await res.json();
    }

    // ── HL / trade.xyz / HyENA ────────────────────────────────────────────────
    if (!agentPrivateKey) {
      throw new Error('Clé privée agent HL manquante');
    }
    const payload = await signHLOrder({
      agentPrivateKey,
      accountAddress: hlAccountAddress,
      order:          { assetIndex, isBuy, size, limitPrice, pxDecimals, szDecimals },
      vaultAddress:   hlVaultAddress,
    });
    const res = await fetch(HL_EXCHANGE_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || `HL HTTP ${res.status}`);
    }
    return await res.json();
  };

  const canTradeHL  = !!agentPrivateKey;
  const canTradeExt = !!starkPrivateKey && !!l2Vault;

  return { placeOrder, canTradeHL, canTradeExt };
}

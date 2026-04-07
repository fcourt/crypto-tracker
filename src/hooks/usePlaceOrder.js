// src/hooks/usePlaceOrder.js

//import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { signL1Action } from '@nktkas/hyperliquid/signing';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, hash, shortString } from 'starknet';
import { loadExtendedL2Configs } from './useExtendedL2Config';
import { encode as encodeMsgpack } from '@std/msgpack'; // ou l'import existant du SDK


// ─── Stark prime (felt252) pour encoder les montants signés ───────────────
const STARK_PRIME = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');

const ORDER_SELECTOR  = '0x36da8d51815527cabfaa9c982f564c80fa7429616739306036f1f9b608dd112';
const DOMAIN_SELECTOR = '0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210';

const EXT_API_BASE          = '/api/extended';
const SERVER_CLOCK_OFFSET_S = 14 * 24 * 3600;

function generateNonce() {
  return Math.floor(Math.random() * (2 ** 31 - 1)) + 1;
}

function generateOrderId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function signedToFelt252(n) {
  const big = BigInt(n);
  return '0x' + (big < 0n ? STARK_PRIME + big : big).toString(16);
}

function uintToFelt252(n) {
  return '0x' + BigInt(n).toString(16);
}

function computeDomainHash(name, version, chainId, revision) {
  return hash.computePoseidonHashOnElements([
    DOMAIN_SELECTOR,
    shortString.encodeShortString(name),
    shortString.encodeShortString(version),
    shortString.encodeShortString(chainId),
    uintToFelt252(revision),
  ]);
}

function computeOrderHash(positionId, baseAssetId, baseAmount, quoteAssetId,
                           quoteAmount, feeAssetId, feeAmount, expiration, salt) {
  return hash.computePoseidonHashOnElements([
    ORDER_SELECTOR,
    uintToFelt252(positionId),
    baseAssetId,
    signedToFelt252(baseAmount),
    quoteAssetId,
    signedToFelt252(quoteAmount),
    feeAssetId,
    uintToFelt252(feeAmount),
    uintToFelt252(expiration),
    uintToFelt252(salt),
  ]);
}

function computeMessageHash(domainHash, starkKey, orderHash) {
  return hash.computePoseidonHashOnElements([
    shortString.encodeShortString('StarkNet Message'),
    domainHash,
    starkKey,
    orderHash,
  ]);
}

function parseQuantum(valueStr, resolution) {
  const resPow = Math.round(Math.log10(resolution));
  const [intPart, decPart = ''] = String(valueStr).split('.');
  const dec = decPart.padEnd(resPow, '0').slice(0, resPow);
  return parseInt(intPart, 10) * resolution + (dec ? parseInt(dec, 10) : 0);
}

function parseCollateral(syntheticAbs, priceStr, collatRes, synthRes) {
  const ratio      = collatRes / synthRes;
  const extraDec   = ratio > 1 ? Math.round(Math.log10(ratio)) : 0;
  const [pInt, pDec = ''] = String(priceStr).split('.');
  const pDecPadded = pDec.padEnd(extraDec, '0').slice(0, extraDec);
  const priceInt   = parseInt(pInt, 10) * ratio + (extraDec > 0 && pDecPadded ? parseInt(pDecPadded, 10) : 0);
  return syntheticAbs * priceInt;
}

// ─── Lecture des clés — toujours fraîche depuis localStorage ─────────────
function readExtApiKey() {
  // Priorité : nouvelle clé simple → ancien format tableau
  return (
    localStorage.getItem('ext_api_key') ||
    (() => {
      try { return JSON.parse(localStorage.getItem('extended_api_keys') || '[]')[0]?.apiKey || ''; }
      catch { return ''; }
    })()
  );
}

// ─── Activer HIP-3 sur l'agent (one-shot, appeler une seule fois) ─────────
export async function enableAgentDexAbstraction(agentPrivateKey, vaultAddress = null) {
  const wallet    = privateKeyToAccount(agentPrivateKey);
  const action    = { type: 'agentEnableDexAbstraction' };
  const nonce     = Date.now();
  const signature = await signL1Action(
    vaultAddress ? { wallet, action, nonce, vaultAddress } : { wallet, action, nonce }
  );
  const body = { action, signature, nonce };
  if (vaultAddress) body.vaultAddress = vaultAddress;

  const res = await fetch('https://api.hyperliquid.xyz/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(text); }
  if (result?.status === 'err') {
    const msg = result?.response ?? '';
    if (msg.includes('transition not allowed')) return result;
    throw new Error(msg || 'Erreur agentEnableDexAbstraction');
  }
  return result;
}

// ─── Placement d'ordre Extended Exchange ─────────────────────────────────
async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const L2_CONFIGS = await loadExtendedL2Configs();
  const l2Config   = L2_CONFIGS[order.extKey];
  if (!l2Config) throw new Error(`Marché non supporté par Extended : ${order.extKey}`);

  const { syntheticId, syntheticResolution, collateralResolution, szDecimals, pxDecimals } = l2Config;

  const nonce             = generateNonce();
  const expiryEpochMillis = Date.now() + 3600 * 1000;
  const expirationSecs    = Math.ceil(expiryEpochMillis / 1000) + SERVER_CLOCK_OFFSET_S;

  const isMarket    = (order.orderType ?? 'maker') === 'taker';
  const timeInForce = isMarket ? 'IOC' : 'GTT';

  const aggressivePrice = isMarket
    ? (order.isBuy ? order.limitPrice * 1.0075 : order.limitPrice * 0.9925)
    : order.limitPrice;

  const sizeStr  = order.size.toFixed(szDecimals);
  const priceStr = aggressivePrice.toFixed(pxDecimals);

  const syntheticAmountAbs  = parseQuantum(sizeStr, syntheticResolution);
  const collateralAmountAbs = parseCollateral(syntheticAmountAbs, priceStr, collateralResolution, syntheticResolution);
  const feeAmount           = Math.ceil(collateralAmountAbs * 0.0005);

  const baseAmount  = order.isBuy ?  syntheticAmountAbs  : -syntheticAmountAbs;
  const quoteAmount = order.isBuy ? -collateralAmountAbs :  collateralAmountAbs;

  const pubKeyBytes = ec.starkCurve.getPublicKey(starkPrivateKey, true);
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const domainHash = computeDomainHash('Perpetuals', 'v0', 'SN_MAIN', 1);
  const orderHash  = computeOrderHash(
    parseInt(l2Vault, 10),
    syntheticId,
    baseAmount,
    '0x1',
    quoteAmount,
    '0x1',
    feeAmount,
    expirationSecs,
    nonce,
  );
  const msgHash = computeMessageHash(domainHash, starkKey, orderHash);

  const sig = ec.starkCurve.sign(msgHash, starkPrivateKey);

  const payload = {
    id:                       generateOrderId(),
    market:                   order.extKey,
    type:                     'LIMIT',
    side:                     order.isBuy ? 'BUY' : 'SELL',
    qty:                      sizeStr,
    price:                    priceStr,
    timeInForce,
    expiryEpochMillis,
    fee:                      '0.0005',
    nonce:                    nonce.toString(),
    selfTradeProtectionLevel: 'ACCOUNT',
    ...(order.reduceOnly && { reduceOnly: true }),
    settlement: {
      signature: {
        r: '0x' + sig.r.toString(16).padStart(64, '0'),
        s: '0x' + sig.s.toString(16).padStart(64, '0'),
      },
      starkKey,
      collateralPosition: l2Vault.toString(),
    },
  };

  console.log('=== Extended Order Debug ===');
  console.log('baseAmount (signed):', baseAmount, '| quoteAmount (signed):', quoteAmount, '| feeAmount:', feeAmount);
  console.log('expirationSecs:', expirationSecs, '| nonce:', nonce);
  console.log('domainHash:', domainHash);
  console.log('orderHash:', orderHash);
  console.log('msgHash:', msgHash);
  console.log('payload:', JSON.stringify(payload, null, 2));

  const res = await fetch(
    `${EXT_API_BASE}?endpoint=${encodeURIComponent('/api/v1/user/order')}`,
    {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':    extApiKey,
        'User-Agent':   'TrekApp/1.0',
      },
      body: JSON.stringify(payload),
    }
  );

  const rawText = await res.text();
  console.log('Extended raw response:', res.status, rawText);

  let data = {};
  try { data = JSON.parse(rawText); } catch { /* non-JSON */ }

  if (!res.ok || data?.status === 'ERROR') {
    throw new Error(data?.error?.message || data?.message || rawText || `Extended HTTP ${res.status}`);
  }
  return data;
}

// ─── Hook principal ───────────────────────────────────────────────────────
export function usePlaceOrder() {

  const placeOrder = async (params) => {
    const starkPrivateKey = localStorage.getItem('ext_stark_pk')     || '';
    const l2Vault         = localStorage.getItem('ext_l2_vault')     || '';
    const extApiKey       = readExtApiKey();
    const agentPrivateKey = localStorage.getItem('hl_agent_pk')      || '';
    const vaultAddress = localStorage.getItem('hl_vault_address')?.trim() || null;

    // ← hlKey ajouté ici
    const { platformId, hlKey, extKey, assetIndex, isBuy, size, limitPrice, pxDecimals, szDecimals } = params;

    if (platformId === 'extended') {
      if (!starkPrivateKey || !l2Vault) throw new Error('Clé Stark ou l2Vault manquant pour Extended');
      return await placeExtendedOrder({
        starkPrivateKey,
        l2Vault,
        extApiKey,
        order: {
          extKey, isBuy, size, limitPrice,
          orderType:  params.orderType  ?? 'maker',
          reduceOnly: params.reduceOnly ?? false,
        },
      });
    }

        // ─── Ordre Hyperliquid ─────────────────────────────────────────────────
    if (!agentPrivateKey) throw new Error('Clé privée agent HL manquante');

    const wallet  = privateKeyToAccount(agentPrivateKey);
    const isMaker = !params.orderType || params.orderType === 'maker';

    const orderEntry = {
      a: assetIndex,
      b: isBuy,
      p: limitPrice.toFixed(pxDecimals ?? 2),
      s: size.toFixed(szDecimals ?? 6),
      r: params.reduceOnly ?? false,
      t: { limit: { tif: isMaker ? 'Gtc' : 'Ioc' } },
    };

    // Pas de champ 'dex' — le mapping agent→vault est géré via agentEnableDexAbstraction
    const action = { type: 'order', orders: [orderEntry], grouping: 'na' };
    const nonce  = Date.now();

// ─── DIAGNOSTIC MSGPACK ───────────────────────────────────
const actionBytes  = encodeMsgpack(action);
const nonceBytes   = new Uint8Array(8);
new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce));

console.log('[HASH DEBUG]', {
  actionHex:  Buffer.from(actionBytes).toString('hex'),
  actionLength: actionBytes.length,
  assetIndex,
  // Pour BTC (a=0) on attend: la valeur msgpack de 0 = 0x00 (1 octet)
  // Pour GOLD (a=100003) on attend: uint32 = 0xce 00 01 86 a3 (5 octets)
});
    
    const signature = await signL1Action({
      wallet, action, nonce,
      ...(vaultAddress ? { vaultAddress } : {}),
    });

    const body = { action, signature, nonce };
    if (vaultAddress) body.vaultAddress = vaultAddress;

    const res = await fetch('https://api.hyperliquid.xyz/exchange', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const text = await res.text();
    let result;
    try { result = JSON.parse(text); } catch { throw new Error(text || `HL HTTP ${res.status}`); }
    if (result?.status === 'err') throw new Error(result?.response ?? 'Erreur HL inconnue');
    return result;
  };

  return {
    placeOrder,
    get canTradeHL()  { return !!localStorage.getItem('hl_agent_pk'); },
    get canTradeExt() { return !!localStorage.getItem('ext_stark_pk') && !!localStorage.getItem('ext_l2_vault'); },
  };
}

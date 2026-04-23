// src/hooks/usePlaceOrder.js

import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { signL1Action } from '@nktkas/hyperliquid/signing';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, hash, shortString } from 'starknet';
import { loadExtendedL2Configs } from './useExtendedL2Config';
import { roundToHLPrice } from '../utils/dnHelpers';
import { placeNadoOrder } from '../utils/nadoSigning';

// ─── Stark prime (felt252) ────────────────────────────────────────────────
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

function readExtApiKey() {
  return (
    localStorage.getItem('ext_api_key') ||
    (() => {
      try { return JSON.parse(localStorage.getItem('extended_api_keys') || '[]')[0]?.apiKey || ''; }
      catch { return ''; }
    })()
  );
}

// ─── Activer HIP-3 sur l'agent (one-shot) ────────────────────────────────
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
export function usePlaceOrder(markets = []) {

  const placeOrder = async (params) => {
    const { platformId, isBuy, size, limitPrice } = params;

    const market = markets.find(m => m.id === params.marketId);
    if (!market) throw new Error(`Marché inconnu : ${params.marketId}`);

    const { assetIndex, szDecimals, pxDecimals, extKey } = market;

    // ─── Ordre Nado ───────────────────────────────────────────────────────
    if (platformId === 'nado') {
      const agentPk      = localStorage.getItem('nado_agent_pk')   || '';
      const address      = localStorage.getItem('nado_address')     || '';
      const subaccount   = localStorage.getItem('nado_subaccount')  || 'default';
      if (!agentPk || !address) throw new Error('Clé agent ou adresse Nado manquante');

      const nadoProductId = market?.nadoProductId;
      if (!nadoProductId) throw new Error(`Marché ${market.label} non disponible sur Nado`);

      // Nado : amount positif = buy, négatif = sell
      const signedSize = isBuy ? Math.abs(size) : -Math.abs(size);

      console.log(`[placeOrder Nado] ${market.label} | productId: ${nadoProductId} | price: ${limitPrice} | size: ${signedSize}`);

      return await placeNadoOrder({
        agentPk,
        address,
        subaccountName: subaccount,
        productId:      nadoProductId,
        price:          limitPrice,
        size:           signedSize,
        reduceOnly:     params.reduceOnly  ?? false,
        orderType:      params.orderType === 'taker' ? 'IOC' : 'POST_ONLY',
      });
    }

    // ─── Ordre Extended Exchange ───────────────────────────────────────────
    if (platformId === 'extended') {
      const starkPrivateKey = localStorage.getItem('ext_stark_pk') || '';
      const l2Vault         = localStorage.getItem('ext_l2_vault') || '';
      const extApiKey       = readExtApiKey();
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

    // ─── Ordre Hyperliquid ────────────────────────────────────────────────
    if (platformId === 'hyperliquid' && assetIndex === null) {
      throw new Error(`Index non résolu pour ${market.label} — réessaie dans 2s`);
    }

    const agentPrivateKey = localStorage.getItem('hl_agent_pk')          || '';
    const vaultAddress    = localStorage.getItem('hl_vault_address')?.trim() || null;
    if (!agentPrivateKey) throw new Error('Clé privée agent HL manquante');

    const roundedPrice = roundToHLPrice(limitPrice);
    const roundedSize  = parseFloat(size.toFixed(szDecimals ?? 6));

    console.log(`[placeOrder HL] ${market.label} | index: ${assetIndex} | price: ${limitPrice} → ${roundedPrice} | size: ${size} → ${roundedSize}`);

    const wallet  = privateKeyToAccount(agentPrivateKey);
    const isMaker = !params.orderType || params.orderType === 'maker';

    const client = new ExchangeClient({
      wallet,
      transport: new HttpTransport(),
      defaultVaultAddress: vaultAddress ?? undefined,
    });

    try {
      const result = await client.order({
        orders: [{
          a: assetIndex,
          b: isBuy,
          p: roundedPrice.toFixed(pxDecimals ?? 2),
          s: roundedSize.toFixed(szDecimals ?? 6),
          r: params.reduceOnly ?? false,
          t: { limit: { tif: isMaker ? 'Gtc' : 'Ioc' } },
        }],
        grouping: 'na',
      });
      console.log('[HL RESPONSE]', JSON.stringify(result));
      return result;
    } catch (e) {
      console.log('[HL ERROR]', e.message);
      console.log('[HL ERROR STACK]', e.stack?.substring(0, 300));
      throw new Error(e.message);
    }
  };

  return {
    placeOrder,
    get canTradeHL()   { return !!localStorage.getItem('hl_agent_pk'); },
    get canTradeExt()  { return !!localStorage.getItem('ext_stark_pk') && !!localStorage.getItem('ext_l2_vault'); },
    get canTradeNado() { return !!localStorage.getItem('nado_agent_pk') && !!localStorage.getItem('nado_address'); },
  };
}

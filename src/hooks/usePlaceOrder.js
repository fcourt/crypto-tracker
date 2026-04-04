// src/hooks/usePlaceOrder.js

import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, hash, shortString } from 'starknet';
import { loadExtendedL2Configs } from './useExtendedL2Config';

// ─── Stark prime (felt252) pour encoder les montants signés ───────────────
const STARK_PRIME = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');

// ─── SELECTORs confirmés par les tests unitaires Rust du SDK officiel ─────
// https://github.com/x10xchange/rust-crypto-lib-base/blob/master/src/starknet_messages.rs
const ORDER_SELECTOR  = '0x36da8d51815527cabfaa9c982f564c80fa7429616739306036f1f9b608dd112';
const DOMAIN_SELECTOR = '0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210';

const EXT_API_BASE          = '/api/extended';
const SERVER_CLOCK_OFFSET_S = 14 * 24 * 3600; // confirmé dans HashOrder() du Go SDK

function generateNonce() {
  return Math.floor(Math.random() * (2 ** 31 - 1)) + 1;
}

function generateOrderId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Convertit un entier signé (i64) en felt252 (two's complement dans F_p)
function signedToFelt252(n) {
  const big = BigInt(n);
  return '0x' + (big < 0n ? STARK_PRIME + big : big).toString(16);
}

// Convertit un entier non signé (u32/u64) en felt252
function uintToFelt252(n) {
  return '0x' + BigInt(n).toString(16);
}

// ─── Hash Poseidon du domaine SNIP-12 ─────────────────────────────────────
// Correspond exactement à StarknetDomain::hash() dans starknet_messages.rs
function computeDomainHash(name, version, chainId, revision) {
  return hash.computePoseidonHashOnElements([
    DOMAIN_SELECTOR,
    shortString.encodeShortString(name),    // cairo_short_string_to_felt("Perpetuals")
    shortString.encodeShortString(version), // cairo_short_string_to_felt("v0")
    shortString.encodeShortString(chainId), // cairo_short_string_to_felt("SN_MAIN")
    uintToFelt252(revision),                // u32 → felt (valeur numérique, pas short string !)
  ]);
}

// ─── Hash Poseidon de l'ordre ─────────────────────────────────────────────
// Correspond exactement à Order::hash() dans starknet_messages.rs
function computeOrderHash(positionId, baseAssetId, baseAmount, quoteAssetId,
                           quoteAmount, feeAssetId, feeAmount, expiration, salt) {
  return hash.computePoseidonHashOnElements([
    ORDER_SELECTOR,
    uintToFelt252(positionId),   // u32 → felt
    baseAssetId,                 // felt hex direct (ex: "0x534f4c2d...")
    signedToFelt252(baseAmount), // i64 signé → felt252  (+250 pour BUY)
    quoteAssetId,                // felt hex direct (= "0x1")
    signedToFelt252(quoteAmount),// i64 signé → felt252  (-20190000 pour BUY)
    feeAssetId,                  // felt hex direct (= "0x1")
    uintToFelt252(feeAmount),    // u64 → felt
    uintToFelt252(expiration),   // u64 → felt (secondes Unix)
    uintToFelt252(salt),         // u64 → felt (nonce)
  ]);
}

// ─── Hash Poseidon du message complet ─────────────────────────────────────
// Correspond à OffChainMessage::message_hash() dans starknet_messages.rs
function computeMessageHash(domainHash, starkKey, orderHash) {
  return hash.computePoseidonHashOnElements([
    shortString.encodeShortString('StarkNet Message'), // MESSAGE_FELT
    domainHash,
    starkKey,   // public_key as felt hex
    orderHash,
  ]);
}

// ── Arithmétique entière exacte (zéro erreur IEEE 754) ────────────────────

// Parse "0.000140" × 1000000 → 140 (sans float)
function parseQuantum(valueStr, resolution) {
  const resPow = Math.round(Math.log10(resolution));
  const [intPart, decPart = ''] = String(valueStr).split('.');
  const dec = decPart.padEnd(resPow, '0').slice(0, resPow);
  return parseInt(intPart, 10) * resolution + (dec ? parseInt(dec, 10) : 0);
}

// collatAbs = syntheticAbs × price × (collatRes/synthRes) en entiers purs
function parseCollateral(syntheticAbs, priceStr, collatRes, synthRes) {
  const ratio     = collatRes / synthRes;                          // ex: 1 pour BTC, 1000 pour SOL
  const extraDec  = ratio > 1 ? Math.round(Math.log10(ratio)) : 0; // nb décimales prix à garder
  const [pInt, pDec = ''] = String(priceStr).split('.');
  const pDecPadded = pDec.padEnd(extraDec, '0').slice(0, extraDec);
  const priceInt   = parseInt(pInt, 10) * ratio + (extraDec > 0 && pDecPadded ? parseInt(pDecPadded, 10) : 0);
  return syntheticAbs * priceInt;
}

// ─── Placement d'ordre Extended Exchange ─────────────────────────────────
async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
   // ── Charge les configs marché dynamiquement ─────────────────────────────
  const L2_CONFIGS = await loadExtendedL2Configs();
  const l2Config   = L2_CONFIGS[order.extKey];
  if (!l2Config) throw new Error(`Marché non supporté par Extended : ${order.extKey}`);
  const { syntheticId, syntheticResolution, collateralResolution, szDecimals, pxDecimals } = l2Config;
  
  const nonce             = generateNonce();
  const expiryEpochMillis = Date.now() + 3600 * 1000;
  // +14 jours : confirmé dans Go SDK HashOrder() → expireTimeWithBuffer
  const expirationSecs    = Math.ceil(expiryEpochMillis / 1000) + SERVER_CLOCK_OFFSET_S;

  const orderType   = order.orderType ?? 'maker';
  const isMarket    = orderType === 'taker';
  const timeInForce = isMarket ? 'IOC' : 'GTT';

  const aggressivePrice = isMarket
    ? (order.isBuy ? order.limitPrice * 1.0075 : order.limitPrice * 0.9925)
    : order.limitPrice;

  const sizeStr  = order.size.toFixed(szDecimals);
  const priceStr = aggressivePrice.toFixed(pxDecimals);

  // ── Montants absolus (ceil si BUY, floor si SELL — Go SDK orders.go) ────
  const syntheticAmountAbs  = parseQuantum(sizeStr, syntheticResolution);
  const collateralAmountAbs = parseCollateral(syntheticAmountAbs, priceStr, collateralResolution, syntheticResolution);
  const feeAmount = Math.ceil(collateralAmountAbs * 0.0005);

  // ── Montants SIGNÉS (Rust i64) ────────────────────────────────────────────
  // BUY  → base (synthetic) POSITIF  / quote (collateral) NÉGATIF
  // SELL → base (synthetic) NÉGATIF  / quote (collateral) POSITIF
  const baseAmount  = order.isBuy ?  syntheticAmountAbs  : -syntheticAmountAbs;
  const quoteAmount = order.isBuy ? -collateralAmountAbs :  collateralAmountAbs;

  // ── Starknet public key ───────────────────────────────────────────────────
  const pubKeyBytes = ec.starkCurve.getPublicKey(starkPrivateKey, true);
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // ── Calcul du hash SNIP-12 (Poseidon plat, sans récursion de structs) ────
  const domainHash = computeDomainHash('Perpetuals', 'v0', 'SN_MAIN', 1);
  const orderHash  = computeOrderHash(
    parseInt(l2Vault, 10),  // positionId : u32
    syntheticId,             // baseAssetId
    baseAmount,              // baseAmount  : i64 signé
    '0x1',                   // quoteAssetId : collateral
    quoteAmount,             // quoteAmount : i64 signé
    '0x1',                   // feeAssetId  : collateral
    feeAmount,               // feeAmount   : u64
    expirationSecs,          // expiration  : u64 secondes
    nonce,                   // salt        : u64
  );
  const msgHash = computeMessageHash(domainHash, starkKey, orderHash);

  // ── Signature Stark ───────────────────────────────────────────────────────
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
      collateralPosition: l2Vault.toString(), // STRING requis (Go SDK: fmt.Sprintf)
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
  const agentPrivateKey = localStorage.getItem('hl_agent_pk')      || '';
  const hlVaultAddress  = localStorage.getItem('hl_vault_address') || null;
  const starkPrivateKey = localStorage.getItem('ext_stark_pk')     || '';
  const l2Vault         = localStorage.getItem('ext_l2_vault')     || '';
  const canTradeHL      = !!agentPrivateKey;
  const canTradeExt     = !!starkPrivateKey && !!l2Vault;

  const placeOrder = async (params) => {
    const freshStarkPk   = localStorage.getItem('ext_stark_pk')  || '';
    const freshL2Vault   = localStorage.getItem('ext_l2_vault')  || ''; // clé unifiée
    const freshExtApiKey = (() => {
      try {
        return JSON.parse(localStorage.getItem('extended_api_keys') || '[]')[0]?.apiKey || '';
      } catch { return ''; }
    })();
    const freshAgentPk      = localStorage.getItem('hl_agent_pk')      || '';
    const freshVaultAddress = localStorage.getItem('hl_vault_address') || null;

    const { platformId, extKey, assetIndex, isBuy, size, limitPrice, pxDecimals, szDecimals } = params;

    if (platformId === 'extended') {
      if (!freshStarkPk || !freshL2Vault) throw new Error('Clé Stark ou l2Vault manquant pour Extended');
      return await placeExtendedOrder({
        starkPrivateKey: freshStarkPk,
        l2Vault:         freshL2Vault,
        extApiKey:       freshExtApiKey,
        order: {
          extKey, isBuy, size, limitPrice,
          orderType:  params.orderType  ?? 'maker',
          reduceOnly: params.reduceOnly ?? false,
        },
      });
    }

    if (!freshAgentPk) throw new Error('Clé privée agent HL manquante');

    const wallet   = privateKeyToAccount(freshAgentPk);
    const exchange = new ExchangeClient({ transport: new HttpTransport(), wallet });

    const isMaker = !params.orderType || params.orderType === 'maker';

    const result = await exchange.order({
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: limitPrice.toFixed(pxDecimals ?? 2),
        s: size.toFixed(szDecimals ?? 6),
        r: false,
        t: { limit: { tif: isMaker ? 'Gtc' : 'Ioc' } },
      }],
      grouping:     'na',
      vaultAddress: freshVaultAddress || undefined,
    });

    if (result?.status === 'err') throw new Error(result?.response ?? 'Erreur HL inconnue');
    return result;
  };

  return { placeOrder, canTradeHL, canTradeExt };
}

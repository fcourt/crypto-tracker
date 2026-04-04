// src/hooks/usePlaceOrder.js

import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, typedData } from 'starknet';

// ─── Starknet field prime (pour encoder les montants négatifs en felt252) ──
const STARK_PRIME = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');

function toFelt(n) {
  const bigN = BigInt(n);
  return (bigN < 0n ? STARK_PRIME + bigN : bigN).toString();
}

// ─── L2 market configs (mainnet) ──────────────────────────────────────────
const L2_CONFIGS = {
  'BTC-USD': { syntheticId: '0x4254432d3600000000000000000000', syntheticResolution: 1000000, collateralResolution: 1000000, szDecimals: 5, pxDecimals: 1 },
  'SOL-USD': { syntheticId: '0x534f4c2d3300000000000000000000', syntheticResolution: 1000,    collateralResolution: 1000000, szDecimals: 2, pxDecimals: 2 },
  'ETH-USD': { syntheticId: '0x4554482d3400000000000000000000', syntheticResolution: 10000,   collateralResolution: 1000000, szDecimals: 3, pxDecimals: 2 },
};

// ─── SNIP-12 domain (mainnet) ─────────────────────────────────────────────
// Confirmé par Go SDK officiel (extended-protocol/extended-sdk-golang)
const SNIP12_DOMAIN = {
  name:     'Perpetuals',
  version:  'v0',
  chainId:  '0x534e5f4d41494e',
  revision: '1',
};

const EXT_API_BASE         = '/api/extended';
const SERVER_CLOCK_OFFSET_S = 14 * 24 * 3600; // confirmé : Go SDK HashOrder() ajoute 14 jours

function generateNonce() {
  return Math.floor(Math.random() * (2 ** 31 - 1)) + 1;
}

function generateOrderId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const nonce             = generateNonce();
  const expiryEpochMillis = Date.now() + 3600 * 1000;
  const expirationSecs    = Math.ceil(expiryEpochMillis / 1000) + SERVER_CLOCK_OFFSET_S;

  const orderType   = order.orderType ?? 'maker';
  const isMarket    = orderType === 'taker';
  const timeInForce = isMarket ? 'IOC' : 'GTT';

  const l2Config = L2_CONFIGS[order.extKey];
  if (!l2Config) throw new Error(`L2 config inconnue pour ${order.extKey}`);
  const { syntheticId, syntheticResolution, collateralResolution, szDecimals, pxDecimals } = l2Config;

  const aggressivePrice = isMarket
    ? (order.isBuy ? order.limitPrice * 1.0075 : order.limitPrice * 0.9925)
    : order.limitPrice;

  const sizeStr  = order.size.toFixed(szDecimals);
  const priceStr = aggressivePrice.toFixed(pxDecimals);
  const side     = order.isBuy ? 'BUY' : 'SELL';

  // ── Montants absolus (ceil si BUY, floor si SELL — Go SDK orders.go) ────
  const syntheticAmountAbs  = order.isBuy
    ? Math.ceil(parseFloat(sizeStr)  * syntheticResolution)
    : Math.floor(parseFloat(sizeStr) * syntheticResolution);
  const collateralAmountAbs = order.isBuy
    ? Math.ceil(parseFloat(priceStr)  * parseFloat(sizeStr) * collateralResolution)
    : Math.floor(parseFloat(priceStr) * parseFloat(sizeStr) * collateralResolution);
  const feeAmount = Math.ceil(collateralAmountAbs * 0.0005);

  // ── Montants SIGNÉS (Go SDK) ──────────────────────────────────────────────
  // BUY  → synthetic positif  / collateral NÉGATIF (tu paies le collateral)
  // SELL → synthetic NÉGATIF  / collateral positif (tu reçois le collateral)
  const syntheticAmount  = order.isBuy ?  syntheticAmountAbs  : -syntheticAmountAbs;
  const collateralAmount = order.isBuy ? -collateralAmountAbs :  collateralAmountAbs;

  // ── Starknet public key ───────────────────────────────────────────────────
  const pubKeyBytes = ec.starkCurve.getPublicKey(starkPrivateKey, true);
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // ── SNIP-12 typed data ────────────────────────────────────────────────────
  // La starkKey est incluse dans le hash via getMessageHash(data, starkKey)
  // Les montants négatifs sont encodés en felt252 via toFelt()
  const orderTypedData = {
    types: {
      StarknetDomain: [
        { name: 'name',     type: 'shortstring' },
        { name: 'version',  type: 'shortstring' },
        { name: 'chainId',  type: 'shortstring' },
        { name: 'revision', type: 'shortstring' },
      ],
      Order: [
        { name: 'positionId',   type: 'felt' },
        { name: 'baseAssetId',  type: 'felt' },
        { name: 'baseAmount',   type: 'felt' },
        { name: 'quoteAssetId', type: 'felt' },
        { name: 'quoteAmount',  type: 'felt' },
        { name: 'feeAssetId',   type: 'felt' },
        { name: 'feeAmount',    type: 'felt' },
        { name: 'expiration',   type: 'felt' },
        { name: 'salt',         type: 'felt' },
      ],
    },
    primaryType: 'Order',
    domain: SNIP12_DOMAIN,
    message: {
      positionId:   l2Vault.toString(),
      baseAssetId:  syntheticId,               // toujours synthetic (base) en premier
      baseAmount:   toFelt(syntheticAmount),   // signé → felt252
      quoteAssetId: '0x1',                     // collateral (mainnet)
      quoteAmount:  toFelt(collateralAmount),  // signé → felt252
      feeAssetId:   '0x1',
      feeAmount:    feeAmount.toString(),
      expiration:   expirationSecs.toString(),
      salt:         nonce.toString(),
    },
  };

  // ── Hash SNIP-12 (Poseidon) + signature Stark ─────────────────────────────
  const msgHash = typedData.getMessageHash(orderTypedData, starkKey);
  const sig     = ec.starkCurve.sign(msgHash, starkPrivateKey);

  const payload = {
    id:                       generateOrderId(),
    market:                   order.extKey,
    type:                     'LIMIT',
    side,
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
      collateralPosition: l2Vault.toString(), // string requis (Go SDK: fmt.Sprintf("%d", vault))
    },
  };

  console.log('=== Extended Order Debug ===');
  console.log('syntheticAmount (signed):', syntheticAmount, '| collateralAmount (signed):', collateralAmount, '| feeAmount:', feeAmount);
  console.log('expirationSecs:', expirationSecs);
  console.log('msgHash (SNIP-12):', msgHash);
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

export function usePlaceOrder() {
  const agentPrivateKey = localStorage.getItem('hl_agent_pk')      || '';
  const hlVaultAddress  = localStorage.getItem('hl_vault_address') || null;
  const starkPrivateKey = localStorage.getItem('ext_stark_pk')     || '';
  const l2Vault         = localStorage.getItem('ext_l2_vault')     || ''; // ← clé unifiée
  const canTradeHL      = !!agentPrivateKey;
  const canTradeExt     = !!starkPrivateKey && !!l2Vault;

  const placeOrder = async (params) => {
    const freshStarkPk   = localStorage.getItem('ext_stark_pk')  || '';
    const freshL2Vault   = localStorage.getItem('ext_l2_vault')  || ''; // ← clé unifiée (était 'ext_l2Vault')
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

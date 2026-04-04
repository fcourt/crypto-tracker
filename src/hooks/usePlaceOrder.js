// src/hooks/usePlaceOrder.js

import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, hash } from 'starknet';

const L2_CONFIGS = {
  'BTC-USD': { syntheticId: '0x4254432d3600000000000000000000', syntheticResolution: 1000000, collateralResolution: 1000000, szDecimals: 5, pxDecimals: 1 },
  'SOL-USD': { syntheticId: '0x534f4c2d3300000000000000000000', syntheticResolution: 1000,    collateralResolution: 1000000, szDecimals: 2, pxDecimals: 2 },
  'ETH-USD': { syntheticId: '0x4554482d3400000000000000000000', syntheticResolution: 10000,   collateralResolution: 1000000, szDecimals: 3, pxDecimals: 2 },
};

const EXT_API_BASE = '/api/extended';
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

async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const nonce             = generateNonce();
  const expiryEpochMillis = Date.now() + 3600 * 1000;

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
  const isBuy    = order.isBuy;

  const pubKeyBytes = ec.starkCurve.getPublicKey(starkPrivateKey, true);
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const baseAmount  = BigInt(Math.round(parseFloat(sizeStr)  * syntheticResolution));
  const quoteAmount = BigInt(Math.round(parseFloat(priceStr) * parseFloat(sizeStr) * collateralResolution));
  const feeAmount = (quoteAmount * 5n + 9999n) / 10000n;
  const assetIdSell = isBuy ? '0x1'       : syntheticId;
  const assetIdBuy  = isBuy ? syntheticId : '0x1';
  const amountSell  = isBuy ? quoteAmount : baseAmount;
  const amountBuy   = isBuy ? baseAmount  : quoteAmount;

  const expirationSecs = BigInt(Math.ceil(expiryEpochMillis / 1000) + SERVER_CLOCK_OFFSET_S);

  // ✅ APRÈS (spec StarkEx — 63 bits par champ, nonce 31 bits)
  const packed0 =
    (amountSell << 157n) |
    (amountBuy  <<  94n) |
    (feeAmount  <<  31n) |
    BigInt(nonce);

  // packed1 : type(10) | positionId(64) | positionId(64) | positionId(64) | expiration(32) | padding(17)
  const packed1 =
    (3n              << 241n) |
    (BigInt(l2Vault) << 177n) |
    (BigInt(l2Vault) << 113n) |
    (BigInt(l2Vault) <<  49n) |
    (expirationSecs  <<  17n);

  const { computePedersenHash } = hash;

  const hexSell  = '0x' + BigInt(assetIdSell).toString(16);
  const hexBuy   = '0x' + BigInt(assetIdBuy).toString(16);
  const hexPack0 = '0x' + packed0.toString(16);
  const hexPack1 = '0x' + packed1.toString(16);

  // H(H(H(H(assetSell, assetBuy), assetFee), packed0), packed1)
  const msgHash = computePedersenHash(
    computePedersenHash(
      computePedersenHash(
        computePedersenHash(hexSell, hexBuy),
        '0x1'
      ),
      hexPack0
    ),
    hexPack1
  );

  // Signer avec String
  const sig = ec.starkCurve.sign(msgHash, starkPrivateKey);
  const r = sig.r;
  const s = sig.s;

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
        r: '0x' + r.toString(16).padStart(64, '0'),
        s: '0x' + s.toString(16).padStart(64, '0'),
      },
      starkKey,
      collateralPosition: parseInt(l2Vault, 10),
    },
  };

  console.log('=== Extended Order Debug ===');
  console.log('baseAmount:', baseAmount.toString(), '| quoteAmount:', quoteAmount.toString(), '| feeAmount:', feeAmount.toString());
  console.log('expirationSecs:', expirationSecs.toString());
  console.log('msgHash:', msgHash);
  console.log('payload:', JSON.stringify(payload, null, 2));

  const res = await fetch(
    `${EXT_API_BASE}?endpoint=${encodeURIComponent('/api/v1/user/order')}`,
    {
      method: 'POST',
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
  const l2Vault         = localStorage.getItem('ext_l2_vault')     || '';
  const canTradeHL      = !!agentPrivateKey;
  const canTradeExt     = !!starkPrivateKey && !!l2Vault;

  const placeOrder = async (params) => {
    const freshStarkPk   = localStorage.getItem('ext_stark_pk')  || '';
    const freshL2Vault   = localStorage.getItem('ext_l2_vault')  || '';
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

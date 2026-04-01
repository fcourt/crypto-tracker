// src/hooks/usePlaceOrder.js

import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, typedData } from 'starknet';

const EXT_API_BASE = '/api/extended';

const STARKNET_DOMAIN = {
  name:     'Perpetuals',
  version:  'v0',
  chainId:  'SN_MAIN',
  revision: '1',
};

const ORDER_TYPES = {
  StarknetDomain: [
    { name: 'name',     type: 'shortstring' },
    { name: 'version',  type: 'shortstring' },
    { name: 'chainId',  type: 'shortstring' },
    { name: 'revision', type: 'shortstring' },
  ],
  Order: [
    { name: 'market',      type: 'shortstring' },
    { name: 'side',        type: 'shortstring' },
    { name: 'type',        type: 'shortstring' },
    { name: 'size',        type: 'shortstring' },
    { name: 'price',       type: 'shortstring' },
    { name: 'timeInForce', type: 'shortstring' },
    { name: 'nonce',       type: 'felt'        },
    { name: 'expiresAt',   type: 'felt'        },
    { name: 'l2Vault',     type: 'felt'        },
  ],
};

function generateNonce() {
  return Math.floor(Math.random() * (2 ** 31 - 1)) + 1;
}

function generateOrderId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Fonction privée — non exportée
async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const nonce             = generateNonce();
  const expiryEpochMillis = Date.now() + 3600 * 1000;
  // const sizeStr           = order.size.toFixed(order.szDecimals ?? 6);
  // const priceStr          = order.limitPrice.toFixed(order.pxDecimals ?? 2);
  // ✅ Précisions réelles du marché
  const { szDecimals, pxDecimals } = await getMarketPrecision(order.extKey, extApiKey);
  const sizeStr  = order.size.toFixed(szDecimals);
const priceStr = order.limitPrice.toFixed(pxDecimals);
  const side              = order.isBuy ? 'BUY' : 'SELL';
  const l2VaultStr        = l2Vault.toString();

  const pubKeyBytes = ec.starkCurve.getPublicKey(starkPrivateKey, true);
  const starkKey    = '0x' + Array.from(pubKeyBytes.slice(1))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const message = {
    market:      order.extKey,
    side,
    type:        'LIMIT',
    size:        sizeStr,
    price:       priceStr,
    timeInForce: 'GTT',
    nonce:       nonce.toString(),
    expiresAt:   expiryEpochMillis.toString(),
    l2Vault:     l2VaultStr,
  };

  const msgHash = typedData.getMessageHash(
    { types: ORDER_TYPES, primaryType: 'Order', domain: STARKNET_DOMAIN, message },
    starkKey
  );

  const { r, s } = ec.starkCurve.sign(msgHash, starkPrivateKey);

  const payload = {
    id:                generateOrderId(),
    market:            order.extKey,
    type:              'LIMIT',
    side,
    qty:               sizeStr,
    price:             priceStr,
    timeInForce:       'GTT',
    expiryEpochMillis,
    fee:               '0.0005',
    nonce:             nonce.toString(),
    settlement: {
      signature: {
        r: '0x' + r.toString(16).padStart(64, '0'),
        s: '0x' + s.toString(16).padStart(64, '0'),
      },
      starkKey,
      collateralPosition: l2VaultStr,
    },
  };

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
    throw new Error(
      data?.error?.message ||
      data?.message ||
      rawText ||
      `Extended HTTP ${res.status}`
    );
  }
  return data;
}

// Récupère les précisions du marché depuis l'API Extended
async function getMarketPrecision(extKey, extApiKey) {
  const res = await fetch(
    `/api/extended?endpoint=${encodeURIComponent('/api/v1/public/instruments')}`,
    { headers: { 'User-Agent': 'TrekApp/1.0' } }
  );
  const data = await res.json();
  console.log('instruments sample:', data?.data?.[0]); // 👈 à ajouter
  const market = data?.data?.find(m => m.symbol === extKey);
  if (!market) throw new Error(`Marché introuvable : ${extKey}`);
  return {
    szDecimals: market.quantityPrecision,
    pxDecimals: market.pricePrecision,
  };
}

// Hook public — exporté
export function usePlaceOrder() {
  const agentPrivateKey = localStorage.getItem('hl_agent_pk')      || '';
  const hlVaultAddress  = localStorage.getItem('hl_vault_address') || null;
  const starkPrivateKey = localStorage.getItem('ext_stark_pk')     || '';
  const l2Vault         = localStorage.getItem('ext_l2_vault')     || '';
  const canTradeHL      = !!agentPrivateKey;
  const canTradeExt     = !!starkPrivateKey && !!l2Vault;

  const placeOrder = async (params) => {
    const freshStarkPk  = localStorage.getItem('ext_stark_pk')  || '';
    const freshL2Vault  = localStorage.getItem('ext_l2_vault')  || '';
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
        order: { extKey, isBuy, size, limitPrice, pxDecimals, szDecimals },
      });
    }

    if (!freshAgentPk) throw new Error('Clé privée agent HL manquante');

    const wallet   = privateKeyToAccount(freshAgentPk);
    const exchange = new ExchangeClient({ transport: new HttpTransport(), wallet });

    const result = await exchange.order({
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: limitPrice.toFixed(pxDecimals ?? 2),
        s: size.toFixed(szDecimals ?? 6),
        r: false,
        t: { limit: { tif: 'Gtc' } },
      }],
      grouping:     'na',
      vaultAddress: freshVaultAddress || undefined,
    });

    if (result?.status === 'err') throw new Error(result?.response ?? 'Erreur HL inconnue');
    return result;
  };

  return { placeOrder, canTradeHL, canTradeExt };
}

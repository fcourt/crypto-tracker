import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { ec, typedData, stark } from 'starknet';

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

async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const nonce     = Date.now();
  const expiresAt = Math.floor(nonce / 1000) + 3600;
  const sizeStr   = order.size.toFixed(order.szDecimals ?? 6);
  const priceStr  = order.limitPrice.toFixed(order.pxDecimals ?? 2);
  const side      = order.isBuy ? 'BUY' : 'SELL';

  const message = {
    market:      order.extKey,
    side,
    type:        'LIMIT',
    size:        sizeStr,
    price:       priceStr,
    timeInForce: 'GTC',
    nonce:       nonce.toString(),
    expiresAt:   expiresAt.toString(),
    l2Vault:     l2Vault.toString(),
  };

  const msgHash = typedData.getMessageHash(
    { types: ORDER_TYPES, primaryType: 'Order', domain: STARKNET_DOMAIN, message },
    stark.makeAddress(l2Vault.toString())
  );

  const { r, s } = ec.starkCurve.sign(msgHash, starkPrivateKey);

  const payload = {
    market:      order.extKey,
    side,
    type:        'LIMIT',
    size:        sizeStr,
    price:       priceStr,
    timeInForce: 'GTC',
    nonce,
    expiresAt,
    l2Vault:     parseInt(l2Vault),
    signature: {
      r: '0x' + r.toString(16),
      s: '0x' + s.toString(16),
    },
  };

  const res = await fetch(
  `${EXT_API_BASE}?endpoint=${encodeURIComponent('/api/v1/user/orders')}`,
    {
      method:  'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':    extApiKey,
      },
      body: JSON.stringify(payload),
    }
  );

  const rawText = await res.text();
  console.log('Extended raw response:', res.status, rawText);

  let data = {};
  try { data = JSON.parse(rawText); } catch { /* réponse non-JSON */ }

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

export function usePlaceOrder() {
  const agentPrivateKey = localStorage.getItem('hl_agent_pk')      || '';
  const hlVaultAddress  = localStorage.getItem('hl_vault_address') || null;
  const starkPrivateKey = localStorage.getItem('ext_stark_pk')     || '';
  const l2Vault         = localStorage.getItem('ext_l2_vault')     || '';
  const extApiKey       = (() => {
    try {
      return JSON.parse(
        localStorage.getItem('extended_api_keys') || '[]'
      )[0]?.apiKey || '';
    } catch { return ''; }
  })();

  const canTradeHL  = !!agentPrivateKey;
  const canTradeExt = !!starkPrivateKey && !!l2Vault;

  const placeOrder = async (params) => {
    const {
      platformId, extKey, assetIndex,
      isBuy, size, limitPrice, pxDecimals, szDecimals,
    } = params;

    if (platformId === 'extended') {
      if (!canTradeExt) throw new Error('Clé Stark ou l2Vault manquant pour Extended');
      return await placeExtendedOrder({
        starkPrivateKey,
        l2Vault,
        extApiKey,
        order: { extKey, isBuy, size, limitPrice, pxDecimals, szDecimals },
      });
    }

    if (!canTradeHL) throw new Error('Clé privée agent HL manquante');

    const wallet   = privateKeyToAccount(agentPrivateKey);
    const exchange = new ExchangeClient({
      transport: new HttpTransport(),
      wallet,
    });

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
      vaultAddress: hlVaultAddress || undefined,
    });

    if (result?.status === 'err') {
      throw new Error(result?.response ?? 'Erreur HL inconnue');
    }
    return result;
  };

  return { placeOrder, canTradeHL, canTradeExt };
}

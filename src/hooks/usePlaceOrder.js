// ─── Hyperliquid ─────────────────────────────────────────────────────────────
import {
  ExchangeClient,
  HttpTransport,
} from '@nktkas/hyperliquid';
import { PrivateKeySigner } from '@nktkas/hyperliquid/signing';

// ─── Extended (Starknet) ─────────────────────────────────────────────────────
import { ec } from 'starknet';

const EXT_API_BASE = '/api/extended';

// ─── Helper Extended : signature SNIP-12 ─────────────────────────────────────

async function placeExtendedOrder({ starkPrivateKey, l2Vault, extApiKey, order }) {
  const nonce     = Date.now();
  const expiresAt = Math.floor(nonce / 1000) + 3600; // +1h

  const payload = {
    market:      order.extKey,
    side:        order.isBuy ? 'BUY' : 'SELL',
    type:        'LIMIT',
    size:        order.size.toFixed(order.szDecimals ?? 6),
    price:       order.limitPrice.toFixed(order.pxDecimals ?? 2),
    timeInForce: 'GTC',
    l2Vault:     String(l2Vault),
    expiresAt,
    nonce,
  };

  // Signature Starknet sur le hash du message
  const msgHash = ec.starkCurve.pedersen(
    BigInt(l2Vault),
    BigInt(nonce)
  );
  const { r, s } = ec.starkCurve.sign(msgHash.toString(), starkPrivateKey);

  const signedPayload = {
    ...payload,
    signature: {
      r: '0x' + r.toString(16),
      s: '0x' + s.toString(16),
    },
  };

  const res = await fetch(
    `${EXT_API_BASE}?endpoint=${encodeURIComponent('/api/v1/orders')}`,
    {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':    extApiKey,
      },
      body: JSON.stringify(signedPayload),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Extended HTTP ${res.status}`);
  }
  return await res.json();
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function usePlaceOrder() {
  // Lecture des clés depuis localStorage
  const agentPrivateKey = localStorage.getItem('hl_agent_pk')       || '';
  const hlVaultAddress  = localStorage.getItem('hl_vault_address')  || null;
  const starkPrivateKey = localStorage.getItem('ext_stark_pk')      || '';
  const l2Vault         = localStorage.getItem('ext_l2_vault')      || '';
  const extApiKey       = (() => {
    try {
      return JSON.parse(
        localStorage.getItem('extended_api_keys') || '[]'
      )[0]?.apiKey || '';
    } catch { return ''; }
  })();

  const canTradeHL  = !!agentPrivateKey;
  const canTradeExt = !!starkPrivateKey && !!l2Vault;

  /**
   * Place un ordre sur la plateforme donnée
   * @param {Object}  params
   * @param {string}  params.platformId  — 'hyperliquid' | 'xyz' | 'hyena' | 'extended'
   * @param {string}  params.extKey      — clé marché Extended (ex: 'BTC-USD-PERP')
   * @param {number}  params.assetIndex  — index HL du coin (ex: 0 pour BTC)
   * @param {boolean} params.isBuy       — true = LONG, false = SHORT
   * @param {number}  params.size        — taille en asset
   * @param {number}  params.limitPrice  — prix limit
   * @param {number}  params.pxDecimals  — décimales prix
   * @param {number}  params.szDecimals  — décimales size
   */
  const placeOrder = async (params) => {
    const {
      platformId, extKey, assetIndex,
      isBuy, size, limitPrice, pxDecimals, szDecimals,
    } = params;

    // ── Extended ─────────────────────────────────────────────────────────────
    if (platformId === 'extended') {
      if (!canTradeExt) throw new Error('Clé Stark ou l2Vault manquant pour Extended');
      return await placeExtendedOrder({
        starkPrivateKey,
        l2Vault,
        extApiKey,
        order: { extKey, isBuy, size, limitPrice, pxDecimals, szDecimals },
      });
    }

    // ── Hyperliquid / trade.xyz / HyENA ───────────────────────────────────────
    if (!canTradeHL) throw new Error('Clé privée agent HL manquante');

    // Le SDK gère toute la signature EIP-712 correctement [web:86]
    const signer   = new PrivateKeySigner({ privateKey: agentPrivateKey });
    const exchange = new ExchangeClient({
      transport: new HttpTransport(),
      wallet:    signer,
    });

    const result = await exchange.order({
      orders: [{
        a: assetIndex,                                // index numérique du coin
        b: isBuy,                                     // true = buy/long
        p: limitPrice.toFixed(pxDecimals ?? 2),      // prix limit
        s: size.toFixed(szDecimals ?? 6),            // size
        r: false,                                     // reduce_only
        t: { limit: { tif: 'Gtc' } },
      }],
      grouping:     'na',
      vaultAddress: hlVaultAddress || undefined,      // sous-compte si configuré
    });

    if (result?.status === 'err') {
      throw new Error(result?.response ?? 'Erreur HL inconnue');
    }
    return result;
  };

  return { placeOrder, canTradeHL, canTradeExt };
}

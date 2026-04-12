// src/services/markets/adapters/hyperliquid.js
import { getCached, setCached } from '../cache.js';
import {
  HL_KEY_OVERRIDES, MARKET_LABELS, inferCategory,
  EXT_KEY_OVERRIDES, NADO_KEY_OVERRIDES,
} from '../../../config/marketsConfig';

const HL_API    = 'https://api.hyperliquid.xyz/info';
export const XYZ_OFFSET = 110000;

// ─── Disponibilité (existant) ─────────────────────────────────────────────────
async function fetchUniverse(body) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HL fetch → ${res.status}`);
  const data = await res.json();
  const [meta] = Array.isArray(data) ? data : [null];
  return new Set((meta?.universe || []).map(a => a.name));
}

export async function fetchHLAvailableKeys() {
  const cached = getCached('hl_all');
  if (cached) return cached;
  const [nativeKeys, xyzKeys] = await Promise.all([
    fetchUniverse({ type: 'metaAndAssetCtxs' }),
    fetchUniverse({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
  ]);
  const allKeys = new Set([...nativeKeys, ...xyzKeys]);
  setCached('hl_all', allKeys);
  return allKeys;
}

export async function fetchXyzAvailableKeys() {
  const cached = getCached('hl_xyz');
  if (cached) return cached;
  const keys = await fetchUniverse({ type: 'metaAndAssetCtxs', dex: 'xyz' });
  setCached('hl_xyz', keys);
  return keys;
}

export const fetchHyenaAvailableKeys = fetchHLAvailableKeys;

// ─── Builder marché (partagé avec fetchHLMids) ────────────────────────────────
export function buildMarketFromHLKey(hlKey) {
  const override = HL_KEY_OVERRIDES[hlKey] || {};
  const id       = override.id || hlKey.replace(/^xyz:/, '');
  const isXyz    = hlKey.startsWith('xyz:');

  let extKey;
  if (id in EXT_KEY_OVERRIDES) {
    extKey = EXT_KEY_OVERRIDES[id];
  } else if (!isXyz) {
    extKey = `${id}-USD`;
  } else {
    extKey = `${id}_24_5-USD`;
  }

  const nadoKey = NADO_KEY_OVERRIDES[id] ?? id;

  return {
    id,
    label:         MARKET_LABELS[id] || id,
    category:      isXyz ? inferCategory(id) : 'Crypto',
    hlKey,
    extKey,
    nadoKey,
    assetIndex:    null, // rempli dans fetchHLMids
    nadoProductId: null,
  };
}

// ─── Prix live ────────────────────────────────────────────────────────────────
export async function fetchHLMids() {
  const [resNative, resXyz] = await Promise.all([
    fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }) }),
    fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }) }),
  ]);

  const [nativeData, xyzData] = await Promise.all([resNative.json(), resXyz.json()]);

  const prices    = {};
  const stepSizes = {};
  const assetMeta = {};
  const discoveredMarkets = new Map();

  const [nativeMeta, nativeCtxs] = Array.isArray(nativeData) ? nativeData : [null, null];
  (nativeMeta?.universe || []).forEach((asset, index) => {
    const market = buildMarketFromHLKey(asset.name);
    market.assetIndex = index;
    discoveredMarkets.set(market.id, market);
    if (nativeCtxs?.[index]?.markPx) {
      prices[asset.name]    = nativeCtxs[index].markPx;
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 3));
    }
    assetMeta[asset.name] = {
      index, szDecimals: asset.szDecimals ?? 6,
      pxDecimals: asset.pxDecimals ?? 2, maxLeverage: asset.maxLeverage ?? null,
    };
  });

  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, index) => {
    const market = buildMarketFromHLKey(asset.name);
    if (!discoveredMarkets.has(market.id)) {
      market.assetIndex = XYZ_OFFSET + index;
      discoveredMarkets.set(market.id, market);
    }
    if (xyzCtxs?.[index]?.markPx) {
      prices[asset.name]    = xyzCtxs[index].markPx;
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 2));
    }
    const entry = {
      index: XYZ_OFFSET + index,
      szDecimals: asset.szDecimals ?? 2, pxDecimals: asset.pxDecimals ?? 2,
      maxLeverage: asset.maxLeverage ?? null,
    };
    assetMeta[asset.name] = entry;
    assetMeta[asset.name.replace(/^xyz:/, '')] = entry;
  });

  return { prices, stepSizes, assetMeta, discoveredMarkets };
}

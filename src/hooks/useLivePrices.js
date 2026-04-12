import { useState, useEffect, useRef, useCallback } from 'react';
import {
  HL_KEY_OVERRIDES, MARKET_LABELS, inferCategory,
  EXT_KEY_OVERRIDES, EMPTY_MARKET, NADO_KEY_OVERRIDES, NADO_ONLY_MARKETS,
} from '../config/marketsConfig';

const HL_API = 'https://api.hyperliquid.xyz/info';
const XYZ_OFFSET = 110000;

// ─── Builders ─────────────────────────────────────────────────────────────────

/** Construit un objet Market depuis une clé HL (native ou xyz:) */
function buildMarketFromHLKey(hlKey) {
  const override = HL_KEY_OVERRIDES[hlKey] || {};
  const id       = override.id || hlKey.replace(/^xyz:/, '');
  const isXyz    = hlKey.startsWith('xyz:');

  // extKey : dérivé automatiquement selon le type
  let extKey;
  if (id in EXT_KEY_OVERRIDES) {
    extKey = EXT_KEY_OVERRIDES[id];   // string ou null (= non dispo sur Extended)
  } else if (!isXyz) {
    extKey = `${id}-USD`;             // crypto natif : BTC-USD, ETH-USD, SOL-USD
  } else {
    extKey = `${id}_24_5-USD`;        // equity xyz : TSLA_24_5-USD, AAPL_24_5-USD
  }
  // nadoKey
  const nadoKey = NADO_KEY_OVERRIDES[id] ?? (
    ['BTC','ETH','SOL','TSLA','AAPL','NVDA','MSFT','AMZN','GOOGL','META'].includes(id)
      ? id : null
  );

  return {
    id,
    label:    MARKET_LABELS[id] || id,
    category: isXyz ? inferCategory(id) : 'Crypto',
    hlKey,
    extKey,
    nadoKey,
  };
}

// ─── Fetch HL ─────────────────────────────────────────────────────────────────

async function fetchHLMids() {
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
  const discoveredMarkets = new Map(); // id → market object

  // Natifs HL
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

  // xyz (HIP-3)
  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, index) => {
    const market = buildMarketFromHLKey(asset.name);
    if (!discoveredMarkets.has(market.id)) 
      market.assetIndex = XYZ_OFFSET + index;
      discoveredMarkets.set(market.id, market);
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

// ─── Fetch Extended ───────────────────────────────────────────────────────────

async function fetchExtMids() {
  const res = await fetch(`/api/extended?endpoint=${encodeURIComponent('/info/markets')}`);
  const data = await res.json();
  const priceMap = {}, precisionMap = {};
  (data.data || []).forEach(m => {
    if (!m.name) return;
    const price = parseFloat(m.marketStats?.lastPrice || 0);
    if (price) priceMap[m.name] = price;
    precisionMap[m.name] = {
      szDecimals: m.quantityPrecision ?? m.qtyPrecision ?? 2,
      pxDecimals: m.pricePrecision ?? 2,
    };
  });
  return { priceMap, precisionMap };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export const PLATFORMS = [
  { id: '',            label: '— Aucune —'     }, 
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl'   },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl'   },
  { id: 'hyena',       label: 'HyENA',       source: 'hl'   },
  { id: 'extended',    label: 'Extended',    source: 'ext'  },
  { id: 'nado',        label: 'Nado',        source: 'nado' },
];

export function useLivePrices(intervalMs = 3000) {
  const [markets,       setMarkets]       = useState([]);   // ← dynamique maintenant
  const [hlMids,        setHlMids]        = useState({});
  const [hlSteps,       setHlSteps]       = useState({});
  const [hlAssetMeta,   setHlAssetMeta]   = useState({});
  const [extMids,       setExtMids]       = useState({});
  const [extPrecisions, setExtPrecisions] = useState({});
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const timer = useRef(null);

  const fetchAll = useCallback(async () => {
    const [hlResult, extResult] = await Promise.all([fetchHLMids(), fetchExtMids()]);

    // Fusionner HL discoveredMarkets + NADO_ONLY_MARKETS
    const allMarkets = [
      EMPTY_MARKET,
      ...hlResult.discoveredMarkets.values(),
      ...NADO_ONLY_MARKETS.filter(m => !hlResult.discoveredMarkets.has(m.id)),
    ];

    setMarkets(allMarkets);
    setHlMids(hlResult.prices     || {});
    setHlSteps(hlResult.stepSizes || {});
    setHlAssetMeta(hlResult.assetMeta || {});
    setExtMids(extResult.priceMap      || {});
    setExtPrecisions(extResult.precisionMap || {});
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    timer.current = setInterval(fetchAll, intervalMs);
    return () => clearInterval(timer.current);
  }, [fetchAll]);

  // ─── Getters (signature inchangée) ──────────────────────────────────────────

  const getAssetMeta = useCallback((hlKey) => {
    if (!hlKey) return null;
    return hlAssetMeta[hlKey] ?? hlAssetMeta[hlKey.replace(/^(xyz:|hyna:)/, '')] ?? null;
  }, [hlAssetMeta]);

  const getExtPrecision = useCallback((extKey) =>
    extPrecisions[extKey] ?? { szDecimals: 2, pxDecimals: 2 }
  , [extPrecisions]);

  const getPrice = useCallback((marketId, platformId) => {
    const market   = markets.find(m => m.id === marketId);
    const platform = PLATFORMS.find(p => p.id === platformId);
    if (!market || !platform) return null;

    if (platform.source === 'hl')
      return market.hlKey ? parseFloat(hlMids[market.hlKey]) || null : null;
    if (platform.source === 'ext')
      return market.extKey ? parseFloat(extMids[market.extKey]) || null : null;
    if (platform.source === 'nado')
      return null; // TODO: brancher le feed de prix Nado

    return null;
  }, [markets, hlMids, extMids]);

  const getStepSize = useCallback((marketId) => {
    const market = markets.find(m => m.id === marketId);
    if (!market?.hlKey) return 0.01;
    return hlSteps[market.hlKey] ?? 0.01;
  }, [markets, hlSteps]);

  // MARKETS exporté comme état dynamique (compatibilité avec le reste du code)
  return { markets, getPrice, getStepSize, getAssetMeta, getExtPrecision, hlMids, extMids, lastUpdate };
}

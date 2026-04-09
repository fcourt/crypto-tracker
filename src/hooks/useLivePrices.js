import { useState, useEffect, useRef, useCallback } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export const MARKETS = [
  // Crypto
  { id: 'BTC',       label: 'BTC',           hlKey: 'BTC',             extKey: 'BTC-USD',        category: 'Crypto' },
  { id: 'ETH',       label: 'ETH',           hlKey: 'ETH',             extKey: 'ETH-USD',        category: 'Crypto' },
  { id: 'SOL',       label: 'SOL',           hlKey: 'SOL',             extKey: 'SOL-USD',        category: 'Crypto' },
  // Indices
  { id: 'SP500',     label: 'S&P 500',       hlKey: 'xyz:SP500',       extKey: 'SPX500m-USD',    category: 'Indices' },
  { id: 'NASDAQ',    label: 'Nasdaq',        hlKey: 'xyz:XYZ100',      extKey: 'TECH100m-USD',   category: 'Indices' },
  { id: 'JP225',     label: 'Nikkei 225',    hlKey: 'xyz:JP225',       extKey: null,             category: 'Indices' },
  { id: 'VIX',       label: 'VIX',           hlKey: 'xyz:VIX',         extKey: null,             category: 'Indices' },
  { id: 'DXY',       label: 'DXY',           hlKey: 'xyz:DXY',         extKey: null,             category: 'Indices' },
  // Commodités
  { id: 'GOLD',      label: 'Gold',          hlKey: 'xyz:GOLD',        extKey: 'XAU-USD',        category: 'Commodités' },
  { id: 'SILVER',    label: 'Silver',        hlKey: 'xyz:SILVER',      extKey: 'XAG-USD',        category: 'Commodités' },
  { id: 'OIL',       label: 'WTI Oil',       hlKey: 'xyz:CL',          extKey: 'WTI-USD',        category: 'Commodités' },
  { id: 'BRENT',     label: 'Brent',         hlKey: 'xyz:BRENTOIL',    extKey: 'XBR-USD',        category: 'Commodités' },
  { id: 'COPPER',    label: 'Copper',        hlKey: 'xyz:COPPER',      extKey: 'XCU-USD',        category: 'Commodités' },
  { id: 'PLAT',      label: 'Platinum',      hlKey: 'xyz:PLATINUM',    extKey: 'XPT-USD',        category: 'Commodités' },
  { id: 'NGAS',      label: 'Nat. Gas',      hlKey: 'xyz:NATGAS',      extKey: 'XNG-USD',        category: 'Commodités' },
  { id: 'PALLADIUM', label: 'Palladium',     hlKey: 'xyz:PALLADIUM',   extKey: null,             category: 'Commodités' },
  { id: 'URANIUM',   label: 'Uranium',       hlKey: 'xyz:URANIUM',     extKey: null,             category: 'Commodités' },
  // Equities
  { id: 'TSLA',      label: 'Tesla',         hlKey: 'xyz:TSLA',        extKey: 'TSLA_24_5-USD',  category: 'Equities' },
  { id: 'AAPL',      label: 'Apple',         hlKey: 'xyz:AAPL',        extKey: 'AAPL_24_5-USD',  category: 'Equities' },
  { id: 'NVDA',      label: 'Nvidia',        hlKey: 'xyz:NVDA',        extKey: 'NVDA_24_5-USD',  category: 'Equities' },
  { id: 'MSFT',      label: 'Microsoft',     hlKey: 'xyz:MSFT',        extKey: 'MSFT_24_5-USD',  category: 'Equities' },
  { id: 'AMZN',      label: 'Amazon',        hlKey: 'xyz:AMZN',        extKey: 'AMZN_24_5-USD',  category: 'Equities' },
  { id: 'GOOGL',     label: 'Google',        hlKey: 'xyz:GOOGL',       extKey: 'GOOG_24_5-USD',  category: 'Equities' },
  { id: 'META',      label: 'Meta',          hlKey: 'xyz:META',        extKey: null,             category: 'Equities' },
  { id: 'COIN',      label: 'Coinbase',      hlKey: 'xyz:COIN',        extKey: 'COIN_24_5-USD',  category: 'Equities' },
  { id: 'PLTR',      label: 'Palantir',      hlKey: 'xyz:PLTR',        extKey: 'PLTR_24_5-USD',  category: 'Equities' },
  { id: 'MSTR',      label: 'MicroStrategy', hlKey: 'xyz:MSTR',        extKey: 'MSTR_24_5-USD',  category: 'Equities' },
  { id: 'AMD',       label: 'AMD',           hlKey: 'xyz:AMD',         extKey: 'AMD_24_5-USD',   category: 'Equities' },
  { id: 'INTC',      label: 'Intel',         hlKey: 'xyz:INTC',        extKey: 'INTC_24_5-USD',  category: 'Equities' },
  { id: 'MU',        label: 'Micron',        hlKey: 'xyz:MU',          extKey: 'MU_24_5-USD',    category: 'Equities' },
  { id: 'HOOD',      label: 'Robinhood',     hlKey: 'xyz:HOOD',        extKey: 'HOOD_24_5-USD',  category: 'Equities' },
  { id: 'CRCL',      label: 'Circle',        hlKey: 'xyz:CRCL',        extKey: 'CRCL_24_5-USD',  category: 'Equities' },
  { id: 'SNDK',      label: 'SanDisk',       hlKey: 'xyz:SNDK',        extKey: 'SNDK_24_5-USD',  category: 'Equities' },
  { id: 'NFLX',      label: 'Netflix',       hlKey: 'xyz:NFLX',        extKey: null,             category: 'Equities' },
  { id: 'ORCL',      label: 'Oracle',        hlKey: 'xyz:ORCL',        extKey: null,             category: 'Equities' },
  { id: 'LLY',       label: 'Eli Lilly',     hlKey: 'xyz:LLY',         extKey: null,             category: 'Equities' },
  { id: 'TSM',       label: 'TSMC',          hlKey: 'xyz:TSM',         extKey: null,             category: 'Equities' },
];

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl' },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl' },
  { id: 'hyena',       label: 'HyENA',       source: 'hl' },
  { id: 'extended',    label: 'Extended',    source: 'ext' },
];

const XYZ_OFFSET = 110000;  // ← remplace 100000

// ─── Fetch HL : prix + step sizes (natif + HIP-3 xyz) ────────────────────────

async function fetchHLMids() {
  const [resNative, resXyz] = await Promise.all([
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    }),
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
    }),
  ]);

  const [nativeData, xyzData] = await Promise.all([
    resNative.json(),
    resXyz.json(),
  ]);

  const prices    = {};
  const stepSizes = {};
  const assetMeta = {}; // ← nouveau

  const [nativeMeta, nativeCtxs] = Array.isArray(nativeData) ? nativeData : [null, null];
  (nativeMeta?.universe || []).forEach((asset, index) => {
    if (nativeCtxs?.[index]?.markPx) {
      prices[asset.name]    = nativeCtxs[index].markPx;
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 3));
    }
    assetMeta[asset.name] = {           // ← même si pas de prix
      index,
      szDecimals:  asset.szDecimals  ?? 6,
      pxDecimals:  asset.pxDecimals  ?? 2,
      maxLeverage: asset.maxLeverage ?? null,
    };
  });

  /*
  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, index) => {
    if (xyzCtxs?.[index]?.markPx) {
      prices[asset.name]    = xyzCtxs[index].markPx;
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 2));
    }
    const entry = {
      index,
      szDecimals:  asset.szDecimals  ?? 2,
      pxDecimals:  asset.pxDecimals  ?? 2,
      maxLeverage: asset.maxLeverage ?? null,
    };
    assetMeta[asset.name] = entry;                           // 'xyz:GOLD'
    const stripped = asset.name.replace(/^xyz:/, '');
    if (stripped !== asset.name) assetMeta[stripped] = entry; // 'GOLD' aussi
  });*/

  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
(xyzMeta?.universe || []).forEach((asset, index) => {
  if (xyzCtxs?.[index]?.markPx) {
    prices[asset.name]    = xyzCtxs[index].markPx;
    stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 2));
  }
  const entry = {
    index:       XYZ_OFFSET + index,   // ← HIP-3 encoded (perp_dex_index=0 pour xyz)
    szDecimals:  asset.szDecimals  ?? 2,
    pxDecimals:  asset.pxDecimals  ?? 2,
    maxLeverage: asset.maxLeverage ?? null,
  };
  assetMeta[asset.name] = entry;
  const stripped = asset.name.replace(/^xyz:/, '');
  if (stripped !== asset.name) assetMeta[stripped] = entry;
});

  return { prices, stepSizes, assetMeta };
}


// ─── Fetch Extended : prix ────────────────────────────────────────────────────

async function fetchExtMids() {
  const res = await fetch(
    `/api/extended?endpoint=${encodeURIComponent('/info/markets')}`
  );
  const data = await res.json();
  const priceMap     = {};
  const precisionMap = {}; // 👈 nouveau

  (data.data || []).forEach(m => {
    const key   = m.name;
    const price = parseFloat(m.marketStats?.lastPrice || 0);
    if (key && price) priceMap[key] = price;

    // 👈 stocker les précisions pour chaque marché
    if (key) {
      precisionMap[key] = {
        szDecimals: m.quantityPrecision ?? m.qtyPrecision ?? m.sizePrecision ?? 2,
        pxDecimals: m.pricePrecision    ?? 2,
      };
    }
  });

  return { priceMap, precisionMap }; // 👈 retourner les deux
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useLivePrices(intervalMs = 3000) {
  const [hlMids,        setHlMids]        = useState({});
  const [hlSteps,       setHlSteps]       = useState({});
  const [hlAssetMeta,   setHlAssetMeta]   = useState({});
  const [extMids,       setExtMids]       = useState({});
  const [extPrecisions, setExtPrecisions] = useState({});
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const timer = useRef(null);

  const fetchAll = async () => {
    const [
      { prices, stepSizes, assetMeta }, // ← assetMeta ajouté ici
      { priceMap, precisionMap },
    ] = await Promise.all([
      fetchHLMids(),
      fetchExtMids(),
    ]);
    setHlMids(prices        || {});
    setHlSteps(stepSizes    || {});
    setHlAssetMeta(assetMeta || {}); // ← maintenant défini
    setExtMids(priceMap     || {});
    setExtPrecisions(precisionMap || {});
    setLastUpdate(new Date());
  };

  useEffect(() => {
    fetchAll();
    timer.current = setInterval(fetchAll, intervalMs);
    return () => clearInterval(timer.current);
  }, []);

  const getAssetMeta = useCallback((hlKey) => {
    if (!hlKey) return null;
    if (hlAssetMeta[hlKey]) return hlAssetMeta[hlKey];
    const stripped = hlKey.replace(/^(xyz:|hyna:)/, '');
    return hlAssetMeta[stripped] ?? null;
  }, [hlAssetMeta]);

  const getExtPrecision = useCallback((extKey) => { // ← une seule fois, useCallback pour stabilité
    return extPrecisions[extKey] ?? { szDecimals: 2, pxDecimals: 2 };
  }, [extPrecisions]);

  const getPrice = (marketId, platformId) => {
    const market = MARKETS.find(m => m.id === marketId);
    if (!market) return null;
    if (!market.hlKey) {
      return market.extKey ? parseFloat(extMids[market.extKey]) || null : null;
    }
    const platform = PLATFORMS.find(p => p.id === platformId);
    if (!platform) return null;
    if (platform.source === 'hl')  return parseFloat(hlMids[market.hlKey]) || null;
    if (platform.source === 'ext') return market.extKey ? parseFloat(extMids[market.extKey]) || null : null;
    return null;
  };

  const getStepSize = (marketId) => {
    const market = MARKETS.find(m => m.id === marketId);
    if (!market?.hlKey) return 0.01;
    return hlSteps[market.hlKey] ?? 0.01;
  };

  return { getPrice, getStepSize, getAssetMeta, getExtPrecision, hlMids, extMids, lastUpdate };
}

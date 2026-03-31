import { useState, useEffect, useRef } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export const MARKETS = [
  // Crypto
  { id: 'BTC',       label: 'BTC',           hlKey: 'BTC',             extKey: 'BTC-USD',        category: 'Crypto' },
  { id: 'ETH',       label: 'ETH',           hlKey: 'ETH',             extKey: 'ETH-USDT',        category: 'Crypto' },
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

  // Perps natifs HL (crypto)
  const [nativeMeta, nativeCtxs] = Array.isArray(nativeData) ? nativeData : [null, null];
  (nativeMeta?.universe || []).forEach((asset, i) => {
    if (nativeCtxs?.[i]?.markPx) {
      prices[asset.name]    = nativeCtxs[i].markPx;
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 3));
    }
  });

  // Marchés HIP-3 trade.xyz (asset.name est déjà "xyz:TSLA" etc.)
  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, i) => {
    if (xyzCtxs?.[i]?.markPx) {
      prices[asset.name]    = xyzCtxs[i].markPx;
      stepSizes[asset.name] = Math.pow(10, -(asset.szDecimals ?? 2));
    }
  });

  return { prices, stepSizes };
}

// ─── Fetch Extended : prix ────────────────────────────────────────────────────

async function fetchExtMids() {
  const res = await fetch(
    `/api/extended?endpoint=${encodeURIComponent('/info/markets')}`
  );
  const data = await res.json();
  const map  = {};
  (data.data || []).forEach(m => {
    const key   = m.name;
    const price = parseFloat(m.marketStats?.lastPrice || 0);
    if (key && price) map[key] = price;
  });
  return map;
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useLivePrices(intervalMs = 3000) {
  const [hlMids,     setHlMids]     = useState({});
  const [hlSteps,    setHlSteps]    = useState({});
  const [extMids,    setExtMids]    = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const timer = useRef(null);

  const fetchAll = async () => {
    try {
      const [{ prices, stepSizes }, ext] = await Promise.all([
        fetchHLMids(),
        fetchExtMids(),
      ]);
      setHlMids(prices    || {});
      setHlSteps(stepSizes || {});
      setExtMids(ext       || {});
      setLastUpdate(new Date());
    } catch (e) {
      console.warn('useLivePrices error:', e.message);
    }
  };

  useEffect(() => {
    fetchAll();
    timer.current = setInterval(fetchAll, intervalMs);
    return () => clearInterval(timer.current);
  }, []);

  const getPrice = (marketId, platformId) => {
    const market = MARKETS.find(m => m.id === marketId);
    if (!market) return null;
    // Pas de clé HL → fallback sur Extended
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

  return { getPrice, getStepSize, hlMids, extMids, lastUpdate };
}

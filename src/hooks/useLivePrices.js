import { useState, useEffect, useRef } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export const MARKETS = [
  // Crypto
  { id: 'BTC',     label: 'BTC',         hlKey: 'BTC',          extKey: 'BTC-USD',      category: 'Crypto' },
  { id: 'ETH',     label: 'ETH',         hlKey: 'ETH',          extKey: 'ETH-USD',      category: 'Crypto' },
  { id: 'SOL',     label: 'SOL',         hlKey: 'SOL',          extKey: 'SOL-USD',      category: 'Crypto' },
  // Indices
  { id: 'SP500',   label: 'S&P 500',     hlKey: 'xyz:SP500',    extKey: 'SPX500m-USD',  category: 'Indices' },
  { id: 'NASDAQ',  label: 'Nasdaq',      hlKey: 'xyz:NDX',      extKey: 'NDX100m-USD',  category: 'Indices' },
  { id: 'DOW',     label: 'Dow Jones',   hlKey: 'xyz:DJI',      extKey: null,           category: 'Indices' },
  // Métaux
  { id: 'GOLD',    label: 'Gold',        hlKey: 'xyz:XAU',      extKey: 'XAU-USD',      category: 'Commodités' },
  { id: 'SILVER',  label: 'Silver',      hlKey: 'xyz:XAG',      extKey: 'XAG-USD',      category: 'Commodités' },
  // Énergie
  { id: 'OIL',     label: 'Crude Oil',   hlKey: 'xyz:WTI',      extKey: 'WTI-USD',      category: 'Commodités' },
  { id: 'BRENT',   label: 'Brent',       hlKey: 'xyz:BRENT',    extKey: 'BRENT-USD',    category: 'Commodités' },
  // Equities (trade.xyz uniquement)
  { id: 'TSLA',    label: 'Tesla',       hlKey: 'xyz:TSLA',     extKey: null,           category: 'Equities' },
  { id: 'AAPL',    label: 'Apple',       hlKey: 'xyz:AAPL',     extKey: null,           category: 'Equities' },
  { id: 'NVDA',    label: 'Nvidia',      hlKey: 'xyz:NVDA',     extKey: null,           category: 'Equities' },
  { id: 'MSFT',    label: 'Microsoft',   hlKey: 'xyz:MSFT',     extKey: null,           category: 'Equities' },
  { id: 'AMZN',    label: 'Amazon',      hlKey: 'xyz:AMZN',     extKey: null,           category: 'Equities' },
  { id: 'GOOGL',   label: 'Google',      hlKey: 'xyz:GOOGL',    extKey: null,           category: 'Equities' },
  { id: 'META',    label: 'Meta',        hlKey: 'xyz:META',     extKey: null,           category: 'Equities' },
];

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl' },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl' },
  { id: 'hyena',       label: 'HyENA',       source: 'hl' },
  { id: 'extended',    label: 'Extended',    source: 'ext' },
];

async function fetchHLMids() {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' }),
  });
  return res.json();
}

async function fetchExtMids() {
  const res = await fetch(
    `/api/extended?endpoint=${encodeURIComponent('/info/markets')}`
  );
  const data = await res.json();
  const map = {};
  (data.data || []).forEach(m => {
    const key   = m.name;
    const price = parseFloat(m.marketStats?.lastPrice || 0);
    if (key && price) map[key] = price;
  });
  
  // ✅ Log tous les marchés Extended disponibles
  console.log('Extended all markets:', Object.keys(map).sort());
  
  return map;
}

export function useLivePrices(intervalMs = 3000) {
  const [hlMids,     setHlMids]     = useState({});
  const [extMids,    setExtMids]    = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const timer = useRef(null);

  const fetchAll = async () => {
    try {
      const [hl, ext] = await Promise.all([fetchHLMids(), fetchExtMids()]);
      setHlMids(hl  || {});
      setExtMids(ext || {});
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
    const market   = MARKETS.find(m => m.id === marketId);
    const platform = PLATFORMS.find(p => p.id === platformId);
    if (!market || !platform) return null;
    if (platform.source === 'hl')  return parseFloat(hlMids[market.hlKey])  || null;
    if (platform.source === 'ext') {
      if (!market.extKey) return null; // marché non dispo sur Extended
      return parseFloat(extMids[market.extKey]) || null;
    }
    return null;
  };

  return { getPrice, hlMids, extMids, lastUpdate };
}

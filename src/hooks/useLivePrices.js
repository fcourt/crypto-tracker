import { useState, useEffect, useRef } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export const MARKETS = [
  // Crypto
  { id: 'BTC',    label: 'BTC',           hlKey: 'BTC',        extKey: 'BTC-USD',       category: 'Crypto' },
  { id: 'ETH',    label: 'ETH',           hlKey: 'ETH',        extKey: 'ETH-USD',       category: 'Crypto' },
  { id: 'SOL',    label: 'SOL',           hlKey: 'SOL',        extKey: 'SOL-USD',       category: 'Crypto' },
  // Indices
  { id: 'SP500',  label: 'S&P 500',       hlKey: 'xyz:SP500',      extKey: 'SPX500m-USD',   category: 'Indices' },
  { id: 'NASDAQ', label: 'Nasdaq',        hlKey: 'xyz:XYZ100',        extKey: 'TECH100m-USD',  category: 'Indices' },
  // Commodités
  { id: 'GOLD',   label: 'Gold',          hlKey: 'xyz:GOLD',        extKey: 'XAU-USD',       category: 'Commodités' },
  { id: 'SILVER', label: 'Silver',        hlKey: 'XAG',        extKey: 'XAG-USD',       category: 'Commodités' },
  { id: 'OIL',    label: 'WTI Oil',       hlKey: 'xyz:CL',        extKey: 'WTI-USD',       category: 'Commodités' },
  { id: 'BRENT',  label: 'Brent',         hlKey: 'BRENT',      extKey: 'XBR-USD',       category: 'Commodités' },
  { id: 'COPPER', label: 'Copper',        hlKey: 'HG',         extKey: 'XCU-USD',       category: 'Commodités' },
  { id: 'PLAT',   label: 'Platinum',      hlKey: 'XPT',        extKey: 'XPT-USD',       category: 'Commodités' },
  { id: 'NGAS',   label: 'Nat. Gas',      hlKey: 'NG',         extKey: 'XNG-USD',       category: 'Commodités' },
  // Equities
  { id: 'TSLA',   label: 'Tesla',         hlKey: 'TSLA',       extKey: 'TSLA_24_5-USD', category: 'Equities' },
  { id: 'AAPL',   label: 'Apple',         hlKey: 'AAPL',       extKey: 'AAPL_24_5-USD', category: 'Equities' },
  { id: 'NVDA',   label: 'Nvidia',        hlKey: 'NVDA',       extKey: 'NVDA_24_5-USD', category: 'Equities' },
  { id: 'MSFT',   label: 'Microsoft',     hlKey: 'MSFT',       extKey: 'MSFT_24_5-USD', category: 'Equities' },
  { id: 'AMZN',   label: 'Amazon',        hlKey: 'AMZN',       extKey: 'AMZN_24_5-USD', category: 'Equities' },
  { id: 'GOOGL',  label: 'Google',        hlKey: 'GOOGL',      extKey: 'GOOG_24_5-USD', category: 'Equities' },
  { id: 'COIN',   label: 'Coinbase',      hlKey: 'COIN',       extKey: 'COIN_24_5-USD', category: 'Equities' },
  { id: 'PLTR',   label: 'Palantir',      hlKey: 'PLTR',       extKey: 'PLTR_24_5-USD', category: 'Equities' },
  { id: 'MSTR',   label: 'MicroStrategy', hlKey: 'MSTR',       extKey: 'MSTR_24_5-USD', category: 'Equities' },
  { id: 'AMD',    label: 'AMD',           hlKey: 'AMD',        extKey: 'AMD_24_5-USD',  category: 'Equities' },
  { id: 'INTC',   label: 'Intel',         hlKey: 'INTC',       extKey: 'INTC_24_5-USD', category: 'Equities' },
  { id: 'MU',     label: 'Micron',        hlKey: 'MU',         extKey: 'MU_24_5-USD',   category: 'Equities' },
  { id: 'HOOD',   label: 'Robinhood',     hlKey: 'HOOD',       extKey: 'HOOD_24_5-USD', category: 'Equities' },
  { id: 'CRCL',   label: 'Circle',        hlKey: 'CRCL',       extKey: 'CRCL_24_5-USD', category: 'Equities' },
  { id: 'SNDK',   label: 'SanDisk',       hlKey: 'SNDK',       extKey: 'SNDK_24_5-USD', category: 'Equities' },
];

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl' },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl' },
  { id: 'hyena',       label: 'HyENA',       source: 'hl' },
  { id: 'extended',    label: 'Extended',    source: 'ext' },
];

async function fetchHLMids() {
  // Un appel pour les perps natifs HL (crypto), un pour les marchés XYZ (equities/commodités)
  const [resNative, resXyz] = await Promise.all([
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),           // dex: "" par défaut = crypto natif
    }),
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids', dex: 'xyz' }), // marchés HIP-3 trade.xyz
    }),
  ]);

  const [nativeMids, xyzMids] = await Promise.all([
    resNative.json(),
    resXyz.json(),
  ]);

  // Merge des deux : xyz: préfixe pour éviter les collisions
  const prices = { ...nativeMids };
  Object.entries(xyzMids || {}).forEach(([k, v]) => {
    prices[`xyz:${k}`] = v;
  });

  console.log('XYZ KEYS:', Object.keys(prices).filter(k => k.startsWith('xyz:')));

  return prices;
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
    if (platform.source === 'hl')  return parseFloat(hlMids[market.hlKey]) || null;  // ✅ hlMids
    if (platform.source === 'ext') {
      if (!market.extKey) return null;
      return parseFloat(extMids[market.extKey]) || null;
    }
    return null;
  };

  return { getPrice, hlMids, extMids, lastUpdate };
}

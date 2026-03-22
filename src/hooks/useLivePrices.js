import { useState, useEffect, useRef } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export const MARKETS = [
  // Crypto
  { id: 'BTC',    label: 'BTC',         hlKey: 'BTC',        extKey: 'BTC-USD',       category: 'Crypto' },
  { id: 'ETH',    label: 'ETH',         hlKey: 'ETH',        extKey: 'ETH-USD',       category: 'Crypto' },
  { id: 'SOL',    label: 'SOL',         hlKey: 'SOL',        extKey: 'SOL-USD',       category: 'Crypto' },
  // Indices
  { id: 'SP500',  label: 'S&P 500',     hlKey: 'xyz:SP500',  extKey: 'SPX500m-USD',   category: 'Indices' },
  { id: 'NASDAQ', label: 'Nasdaq',      hlKey: 'xyz:NDX',    extKey: 'TECH100m-USD',  category: 'Indices' },
  // Métaux & Commodités
  { id: 'GOLD',   label: 'Gold',        hlKey: 'xyz:XAU',    extKey: 'XAU-USD',       category: 'Commodités' },
  { id: 'SILVER', label: 'Silver',      hlKey: 'xyz:XAG',    extKey: 'XAG-USD',       category: 'Commodités' },
  { id: 'OIL',    label: 'WTI Oil',     hlKey: 'xyz:CL',     extKey: 'WTI-USD',       category: 'Commodités' },
  { id: 'BRENT',  label: 'Brent',       hlKey: 'xyz:BRENT',  extKey: 'XBR-USD',       category: 'Commodités' },
  { id: 'COPPER', label: 'Copper',      hlKey: 'xyz:HG',     extKey: 'XCU-USD',       category: 'Commodités' },
  { id: 'PLAT',   label: 'Platinum',    hlKey: 'xyz:XPT',    extKey: 'XPT-USD',       category: 'Commodités' },
  { id: 'NGAS',   label: 'Nat. Gas',    hlKey: 'xyz:NG',     extKey: 'XNG-USD',       category: 'Commodités' },
  // Equities — disponibles sur les deux plateformes
  { id: 'TSLA',   label: 'Tesla',       hlKey: 'xyz:TSLA',   extKey: 'TSLA_24_5-USD', category: 'Equities' },
  { id: 'AAPL',   label: 'Apple',       hlKey: 'xyz:AAPL',   extKey: 'AAPL_24_5-USD', category: 'Equities' },
  { id: 'NVDA',   label: 'Nvidia',      hlKey: 'xyz:NVDA',   extKey: 'NVDA_24_5-USD', category: 'Equities' },
  { id: 'MSFT',   label: 'Microsoft',   hlKey: 'xyz:MSFT',   extKey: 'MSFT_24_5-USD', category: 'Equities' },
  { id: 'AMZN',   label: 'Amazon',      hlKey: 'xyz:AMZN',   extKey: 'AMZN_24_5-USD', category: 'Equities' },
  { id: 'GOOGL',  label: 'Google',      hlKey: 'xyz:GOOGL',  extKey: 'GOOG_24_5-USD', category: 'Equities' },
  { id: 'COIN',   label: 'Coinbase',    hlKey: 'xyz:COIN',   extKey: 'COIN_24_5-USD', category: 'Equities' },
  { id: 'PLTR',   label: 'Palantir',    hlKey: 'xyz:PLTR',   extKey: 'PLTR_24_5-USD', category: 'Equities' },
  { id: 'MSTR',   label: 'MicroStrategy', hlKey: 'xyz:MSTR', extKey: 'MSTR_24_5-USD', category: 'Equities' },
  { id: 'AMD',    label: 'AMD',         hlKey: 'xyz:AMD',    extKey: 'AMD_24_5-USD',  category: 'Equities' },
  { id: 'INTC',   label: 'Intel',       hlKey: 'xyz:INTC',   extKey: 'INTC_24_5-USD', category: 'Equities' },
  { id: 'MU',     label: 'Micron',      hlKey: 'xyz:MU',     extKey: 'MU_24_5-USD',   category: 'Equities' },
  { id: 'HOOD',   label: 'Robinhood',   hlKey: 'xyz:HOOD',   extKey: 'HOOD_24_5-USD', category: 'Equities' },
  { id: 'CRCL',   label: 'Circle',      hlKey: 'xyz:CRCL',   extKey: 'CRCL_24_5-USD', category: 'Equities' },
  { id: 'AMD2',   label: 'SanDisk',     hlKey: 'xyz:SNDK',   extKey: 'SNDK_24_5-USD', category: 'Equities' },
];

export const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid', source: 'hl' },
  { id: 'xyz',         label: 'trade.xyz',   source: 'hl' },
  { id: 'hyena',       label: 'HyENA',       source: 'hl' },
  { id: 'extended',    label: 'Extended',    source: 'ext' },
];

async function fetchHLMids() {
  const [midsRes, metaRes] = await Promise.all([
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    }),
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    }),
  ]);

  const mids = await midsRes.json();
  const meta = await metaRes.json();

  // Construire un map nom → prix en résolvant les indices @N
  const namedMids = { ...mids };
  (meta?.universe || []).forEach((asset, i) => {
    const indexKey = `@${i}`;
    if (mids[indexKey] !== undefined) {
      namedMids[asset.name] = mids[indexKey];
    }
  });

  console.log('SP500:', namedMids['SP500']);
  console.log('XAU:', namedMids['XAU']);
  console.log('WTI:', namedMids['WTI'], namedMids['CL']);

  return namedMids;
}

  const data = await res.json();
  // ✅ Toutes les clés qui ne sont pas des cryptos classiques
  const nonCrypto = Object.keys(data).filter(k =>
    !k.match(/^[A-Z0-9]{2,6}$/) || k.includes(':')
  );
  console.log('HL non-crypto keys:', nonCrypto);
  console.log('HL SP500:', data['SP500'], data['@SP500'], data['xyz:SP500']);
  console.log('HL XAU:', data['XAU'], data['@XAU'], data['xyz:XAU']);
  console.log('HL CL:', data['CL'], data['@CL'], data['WTI']);
  
  return data; // ✅ retourner data, pas res.json() une deuxième fois  
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
    if (platform.source === 'hl')  return parseFloat(hlMids[market.hlKey])  || null;
    if (platform.source === 'ext') {
      if (!market.extKey) return null;
      return parseFloat(extMids[market.extKey]) || null;
    }
    return null;
  };

  return { getPrice, hlMids, extMids, lastUpdate };
}

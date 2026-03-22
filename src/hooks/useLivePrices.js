import { useState, useEffect, useRef } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';
const EXT_API = 'https://api.starknet.extended.exchange/api/v1';

// Mapping marché → clés dans chaque API
export const MARKETS = [
  { id: 'BTC',    label: 'BTC',     hlKey: 'BTC',        extKey: 'BTC-USD' },
  { id: 'ETH',    label: 'ETH',     hlKey: 'ETH',        extKey: 'ETH-USD' },
  { id: 'SOL',    label: 'SOL',     hlKey: 'SOL',        extKey: 'SOL-USD' },
  { id: 'SP500',  label: 'S&P 500', hlKey: 'xyz:SP500',  extKey: 'SPX500m-USD' },
  { id: 'GOLD',   label: 'Gold',    hlKey: 'xyz:XAU',    extKey: 'XAU-USD' },
  { id: 'NASDAQ', label: 'Nasdaq',  hlKey: 'xyz:NDX',    extKey: 'NDX100m-USD' },
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
  const data = await res.json();
  console.log('HL mids sample:', Object.entries(data).slice(0, 3));
  return data;
}

//async function fetchHLMids() {
//  const res = await fetch(HL_API, {
//    method: 'POST',
//    headers: { 'Content-Type': 'application/json' },
//    body: JSON.stringify({ type: 'allMids' }),
//  });
//  return res.json();
//}

async function fetchExtMids() {
  const res = await fetch(`${EXT_API}/info/markets`);
  const data = await res.json();

  //log a supprimer
  console.log('Extended markets raw:', JSON.stringify(data).slice(0, 500));
  
  // Transformer en map { 'BTC-USD': price, ... }
  const map = {};
  (data.data || data || []).forEach(m => {
    map[m.market || m.symbol] = parseFloat(m.markPrice || m.lastPrice || 0);
  });

  //log a supprimer
  console.log('Extended mids map:', map);
  
  return map;
}

export function useLivePrices(intervalMs = 3000) {
  const [hlMids,  setHlMids]  = useState({});
  const [extMids, setExtMids] = useState({});
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

  // Retourne le prix d'un marché pour une plateforme donnée
  const getPrice = (marketId, platformId) => {
    const market   = MARKETS.find(m => m.id === marketId);
    const platform = PLATFORMS.find(p => p.id === platformId);
    if (!market || !platform) return null;
    if (platform.source === 'hl')  return parseFloat(hlMids[market.hlKey])  || null;
    if (platform.source === 'ext') return parseFloat(extMids[market.extKey]) || null;
    return null;
  };

  return { getPrice, hlMids, extMids, lastUpdate };
}

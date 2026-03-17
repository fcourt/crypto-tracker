import { useState, useCallback } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export function useHyperliquidFunding() {
  const [funding, setFunding] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const fetchFunding = useCallback(async (address, startTime = null) => {
    if (!address) return;
    setLoading(true);
    setError(null);
    setFunding([]);
    try {
      const body = {
        type: 'userFunding',
        user: address,
        startTime: startTime || Date.now() - 30 * 86400000, // 30 jours par défaut
        endTime: Date.now(),
      };
      const res  = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);
      const data = await res.json();
      // data = [ { time, coin, usdc, szi, nSamples }, ... ]
      setFunding(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { funding, loading, error, fetchFunding };
}

export function computeFundingStats(funding) {
  const totalUsdc = funding.reduce((acc, f) => acc + parseFloat(f.usdc || 0), 0);

  // Groupement par coin
  const byCoin = {};
  funding.forEach(f => {
    if (!byCoin[f.coin]) byCoin[f.coin] = 0;
    byCoin[f.coin] += parseFloat(f.usdc || 0);
  });

  // Groupement par heure (pour détecter les heures récurrentes)
  const byHour = {};
  funding.forEach(f => {
    const hour = new Date(f.time).getUTCHours();
    if (!byHour[hour]) byHour[hour] = { count: 0, total: 0 };
    byHour[hour].count += 1;
    byHour[hour].total += parseFloat(f.usdc || 0);
  });

  // Top coins par funding reçu/payé
  const topCoins = Object.entries(byCoin)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);

  return { totalUsdc, byCoin, byHour, topCoins };
}

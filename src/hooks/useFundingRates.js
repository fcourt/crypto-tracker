import { useState, useEffect } from 'react';
import { MARKETS } from './useLivePrices';

const HL_API = 'https://api.hyperliquid.xyz/info';

// Récupère les funding rates natifs HL (crypto) + HIP-3 trade.xyz en parallèle
async function fetchAllFundingRates() {
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

  const rates = {};

  // Perps natifs HL (crypto)
  const [nativeMeta, nativeCtxs] = Array.isArray(nativeData) ? nativeData : [null, null];
  (nativeMeta?.universe || []).forEach((asset, i) => {
    const rate = parseFloat(nativeCtxs?.[i]?.funding ?? 0);
    rates[asset.name] = rate;
  });

  // Marchés HIP-3 trade.xyz → clé préfixée "xyz:"
  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, i) => {
    const rate = parseFloat(xyzCtxs?.[i]?.funding ?? 0);
    rates[asset.name] = rate; // asset.name est déjà "xyz:TSLA" etc.
  });

  return rates;
}

async function fetchExtFundingRate(extKey, apiKey) {
  if (!extKey || !apiKey) return null;
  try {
    const res = await fetch(
      `/api/extended?endpoint=${encodeURIComponent('/info/markets')}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const market = (data.data || []).find(m => m.name === extKey);
    if (!market) return null;
    return parseFloat(market.marketStats?.fundingRate ?? null);
  } catch {
    return null;
  }
}

// Retourne le funding rate pour un marché sur une plateforme donnée
function getRateFromMap(rates, marketId, platformId) {
  const market = MARKETS.find(m => m.id === marketId);
  if (!market) return null;

  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId)) {
    const key = market.hlKey;
    if (!key) return null;
    return rates[key] ?? null;
  }
  return null; // extended géré séparément via API
}

export function useFundingRates(marketId, platform1Id, platform2Id, extApiKey = '') {
  const [rates, setRates] = useState({ p1: null, p2: null });

  useEffect(() => {
    if (!marketId || !platform1Id || !platform2Id) return;

    const refresh = async () => {
      try {
        const market = MARKETS.find(m => m.id === marketId);
        const hlRates = await fetchAllFundingRates();

        const p1 = platform1Id === 'extended'
          ? await fetchExtFundingRate(market?.extKey, extApiKey)
          : getRateFromMap(hlRates, marketId, platform1Id);

        const p2 = platform2Id === 'extended'
          ? await fetchExtFundingRate(market?.extKey, extApiKey)
          : getRateFromMap(hlRates, marketId, platform2Id);

        setRates({ p1, p2 });
      } catch (e) {
        console.warn('useFundingRates error:', e.message);
      }
    };

    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [marketId, platform1Id, platform2Id]);

  return rates;
}

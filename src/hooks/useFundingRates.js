import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

async function fetchHLFundingRates() {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  const [meta, ctxs] = await res.json();
  const map = {};
  (meta?.universe || []).forEach((asset, i) => {
    map[asset.name] = parseFloat(ctxs?.[i]?.funding || 0);
  });
  return map;
}

async function fetchExtFundingRate(market) {
  const res = await fetch(
    `https://api.starknet.extended.exchange/api/v1/info/${market}/funding`
  );
  const data = await res.json();
  return parseFloat(data?.data?.fundingRate || data?.fundingRate || 0);
}

export function useFundingRates(marketId, platform1Id, platform2Id) {
  const [rates, setRates] = useState({ p1: null, p2: null });

  useEffect(() => {
    if (!marketId || !platform1Id || !platform2Id) return;

    const fetch = async () => {
      try {
        const hlRates = await fetchHLFundingRates();

        const getRate = async (platformId) => {
          if (platformId === 'hyperliquid') return hlRates['BTC'] !== undefined ? hlRates : null;
          if (platformId === 'xyz')   return hlRates;
          if (platformId === 'hyena') return hlRates;
          if (platformId === 'extended') {
            const { MARKETS } = await import('./useLivePrices');
            const m = MARKETS.find(m => m.id === marketId);
            if (!m) return 0;
            return fetchExtFundingRate(m.extKey);
          }
          return 0;
        };

        const getRateForPlatform = (platformId, hlMap) => {
          const { MARKETS } = require('./useLivePrices');
          const m = MARKETS.find(m => m.id === marketId);
          if (!m) return 0;
          if (['hyperliquid', 'xyz', 'hyena'].includes(platformId)) {
            return hlMap[m.hlKey] ?? 0;
          }
          return null;
        };

        const [p2rate] = await Promise.all([
          platform2Id === 'extended'
            ? (async () => {
                const { MARKETS } = await import('./useLivePrices');
                const m = MARKETS.find(m => m.id === marketId);
                return m ? fetchExtFundingRate(m.extKey) : 0;
              })()
            : Promise.resolve(getRateForPlatform(platform2Id, hlRates)),
        ]);

        setRates({
          p1: getRateForPlatform(platform1Id, hlRates),
          p2: platform2Id === 'extended' ? p2rate : getRateForPlatform(platform2Id, hlRates),
        });
      } catch (e) {
        console.warn('useFundingRates error:', e.message);
      }
    };

    fetch();
    const t = setInterval(fetch, 60000); // refresh toutes les minutes
    return () => clearInterval(t);
  }, [marketId, platform1Id, platform2Id]);

  return rates;
}

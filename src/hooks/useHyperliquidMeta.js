import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

// Cache en mémoire pour éviter de refetch à chaque render
let metaCache = null;

export function useHyperliquidMeta() {
  const [coinPlatformMap, setCoinPlatformMap] = useState({});

  useEffect(() => {
    if (metaCache) { setCoinPlatformMap(metaCache); return; }

    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    })
      .then(r => r.json())
      .then(data => {
        const map = {};
        // data.universe = liste de tous les markets perp
        (data.universe || []).forEach(market => {
          const name = market.name;
          const dex  = (market.dex || '').toLowerCase();

          if (dex.includes('hyena'))                  map[name] = 'hyena';
          else if (dex.includes('xyz') || dex.includes('trade')) map[name] = 'xyz';
          else if (dex === '' || dex === 'hyperliquid') map[name] = 'hyperliquid';
          else                                          map[name] = 'other_hip3';
        });
        metaCache = map;
        setCoinPlatformMap(map);
      })
      .catch(console.error);
  }, []);

  return coinPlatformMap;
}

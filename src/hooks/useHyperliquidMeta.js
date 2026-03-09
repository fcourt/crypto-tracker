import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

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
        // DEBUG — à supprimer après vérification
        console.log('Structure meta:', JSON.stringify(data.universe.slice(0, 3), null, 2));

        const map = {};
        (data.universe || []).forEach(market => {
          const name = market.name;
          const dex  = (market.dex || '').toLowerCase();

          if (dex.includes('hyena'))                        map[name] = 'hyena';
          else if (dex.includes('xyz') || dex.includes('trade')) map[name] = 'xyz';
          else if (dex === '' || dex === 'hyperliquid')     map[name] = 'hyperliquid';
          else                                               map[name] = 'other_hip3';
        });

        metaCache = map;
        setCoinPlatformMap(map);
      })
      .catch(console.error);

  }, []);

  return coinPlatformMap;
}

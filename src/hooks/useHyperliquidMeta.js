import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';
let metaCache = null;

export function useHyperliquidMeta() {
  const [coinPlatformMap, setCoinPlatformMap] = useState({});

  useEffect(() => {
    if (metaCache) { setCoinPlatformMap(metaCache); return; }

    Promise.all([
      fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'perpDexs' }),
      }).then(r => r.json()),
      fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      }).then(r => r.json()),
    ])
    .then(([dexs, meta]) => {
      const map = {};

      // Perps natifs HL
      (meta.universe || []).forEach(market => {
        map[market.name] = 'hyperliquid';
      });

      // Perps HIP-3
      (dexs || []).forEach(dex => {
        if (!dex) return;

        // DEBUG — à supprimer après vérification
        console.log('DEX name:', dex.name, '→ coins:', Object.keys(dex.assetToStreamingOiCap || {}).slice(0, 3));

        const platform = resolvePlatform(dex.name);
        const coins = Object.keys(dex.assetToStreamingOiCap || {});
        coins.forEach(coinKey => {
          map[coinKey] = platform;
        });
      });

      console.log('Coins XYZ:', Object.entries(map).filter(([, v]) => v === 'xyz').slice(0, 5));
      console.log('Coins HyENA:', Object.entries(map).filter(([, v]) => v === 'hyena').slice(0, 5));

      metaCache = map;
      setCoinPlatformMap(map);
    })
    .catch(console.error);
  }, []);

  return coinPlatformMap;
}

function resolvePlatform(dexName) {
  const d = (dexName || '').toLowerCase();
  if (d === '')                                          return 'hyperliquid';
  if (d === 'hyna' || d.includes('hyna') || d.includes('hyena')) return 'hyena';
  if (d === 'xyz'  || d.includes('xyz'))                return 'xyz';
  return 'other_hip3';
}

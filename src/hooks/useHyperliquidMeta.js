import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';
let metaCache = null;

export function useHyperliquidMeta() {
  const [coinPlatformMap, setCoinPlatformMap] = useState({});

  useEffect(() => {
    if (metaCache) { setCoinPlatformMap(metaCache); return; }

    Promise.all([
      // On récupère perpDexs pour la liste des DEX HIP-3
      fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'perpDexs' }),
      }).then(r => r.json()),
      // On récupère meta pour la liste des perps natifs HL
      fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      }).then(r => r.json()),
    ])
    .then(([dexs, meta]) => {
      const map = {};

      // Perps natifs HL depuis meta.universe (pas de préfixe dans le coin)
      (meta.universe || []).forEach(market => {
        map[market.name] = 'hyperliquid';
      });

      // Perps HIP-3 : dexs est un tableau, null = natifs HL (déjà traités)
      (dexs || []).forEach(dex => {
        if (!dex) return; // skip null (natifs HL)
        const platform = resolvePlatform(dex.name);
        const coins = Object.keys(dex.assetToStreamingOiCap || {});
        // Le coin est au format "xyz:AAPL" → on le stocke tel quel
        // car c'est ce que retournera fill.coin
        coins.forEach(coinKey => {
          map[coinKey] = platform;
        });
      });

      console.log('Coins XYZ:', Object.entries(map).filter(([,v]) => v === 'xyz').slice(0, 5));
      console.log('Coins HyENA:', Object.entries(map).filter(([,v]) => v === 'hyena').slice(0, 5));

      metaCache = map;
      setCoinPlatformMap(map);
    })
    .catch(console.error);
  }, []);

  return coinPlatformMap;
}

function resolvePlatform(dexName) {
  const d = (dexName || '').toLowerCase();
  if (d === '' || d === 'null') return 'hyperliquid';
  if (d.includes('hyena'))     return 'hyena';
  if (d === 'xyz')             return 'xyz';
  return 'other_hip3';
}

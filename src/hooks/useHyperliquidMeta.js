import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';
let metaCache = null;

export function useHyperliquidMeta() {
  const [coinPlatformMap, setCoinPlatformMap] = useState({});

  useEffect(() => {
    if (metaCache) { setCoinPlatformMap(metaCache); return; }

    // perpDexs retourne un objet { "dexName": [ {name, szDecimals, ...}, ... ], ... }
    // La clé null ou "" représente les perps natifs Hyperliquid
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'perpDexs' }),
    })
      .then(r => r.json())
      .then(data => {
        // DEBUG — à supprimer après vérification
        console.log('perpDexs keys:', Object.keys(data));
        console.log('perpDexs sample:', JSON.stringify(data, null, 2).slice(0, 500));

        const map = {};
        Object.entries(data).forEach(([dexName, coins]) => {
          const platform = resolvePlatform(dexName);
          (coins || []).forEach(coin => {
            map[coin.name] = platform;
          });
        });

        metaCache = map;
        setCoinPlatformMap(map);
      })
      .catch(console.error);
  }, []);

  return coinPlatformMap;
}

function resolvePlatform(dexName) {
  const d = (dexName || '').toLowerCase();
  if (d === '' || d === 'null')         return 'hyperliquid'; // perps natifs
  if (d.includes('hyena'))             return 'hyena';
  if (d.includes('xyz') || d.includes('trade')) return 'xyz';
  return 'other_hip3';
}

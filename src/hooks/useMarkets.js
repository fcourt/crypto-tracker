// src/hooks/useMarkets.js
/*import { useState, useEffect } from 'react';
import { MARKETS } from './useLivePrices';

const HL_API = 'https://api.hyperliquid.xyz/info';

let _resolvedMarkets = null;
let _resolvingPromise = null;

async function buildMarkets() {
  if (_resolvedMarkets) return _resolvedMarkets;
  if (_resolvingPromise) return _resolvingPromise;

  _resolvingPromise = (async () => {
    try {
      const [nativeRes, xyzRes] = await Promise.all([
        fetch(HL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meta' }),
        }).then(r => r.json()),
        fetch(HL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meta', dex: 'xyz' }),
        }).then(r => r.json()),
      ]);

      const nativeCount = nativeRes.universe?.length ?? 0;

      // HIP-3 : offset officiel = 110000 + dex_position * 10000
      // xyz est le premier DEX HIP-3 (i=0) → offset = 110000
      const XYZ_OFFSET = 110000;
      // Map hlKey → assetIndex
      const indexMap = {};

      (nativeRes.universe ?? []).forEach((asset, i) => {
        indexMap[asset.name] = i;
      });
      
      (xyzRes.universe ?? []).forEach((asset, i) => {
        indexMap[asset.name] = XYZ_OFFSET + i;
      });

      console.log('[MARKETS] indexMap sample:', {
        BTC:        indexMap['BTC'],
        'xyz:GOLD': indexMap['xyz:GOLD'],  // doit afficher 110003
      });

      // Enrichit MARKETS existant avec assetIndex résolu
      _resolvedMarkets = MARKETS.map(m => ({
        ...m,
        assetIndex: m.hlKey ? (indexMap[m.hlKey] ?? null) : null,
      }));

      return _resolvedMarkets;

    } catch (e) {
      console.error('[MARKETS] résolution échouée:', e.message);
      // Fallback : MARKETS sans assetIndex
      return MARKETS.map(m => ({ ...m, assetIndex: null }));
    }
  })();

  return _resolvingPromise;
}

export async function getMarkets() {
  return buildMarkets();
}

export function useMarkets() {
  // Initialise avec MARKETS statique (affichage immédiat, assetIndex null)
  const [markets, setMarkets] = useState(
    _resolvedMarkets ?? MARKETS.map(m => ({ ...m, assetIndex: null }))
  );

  useEffect(() => {
    if (_resolvedMarkets) return;
    buildMarkets().then(setMarkets);
  }, []);

  return { markets };
}

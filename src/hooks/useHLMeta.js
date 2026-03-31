import { useState, useEffect } from 'react';

const HL_API       = 'https://api.hyperliquid.xyz/info';
const CACHE_KEY    = 'hl_meta_cache';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1h

export function useHLMeta() {
  const [assetMap, setAssetMap] = useState(() => {
    // Charger depuis le cache localStorage si récent
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data || {};
      }
    } catch { /* ignore */ }
    return {};
  });

  useEffect(() => {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS) return;

    fetch(HL_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'meta' }),
    })
      .then(r => r.json())
      .then(meta => {
        // Construire un map { 'BTC': { index: 0, szDecimals: 5, pxDecimals: 2 }, ... }
        const map = {};
        (meta?.universe || []).forEach((asset, i) => {
          map[asset.name] = {
            index:      i,
            szDecimals: asset.szDecimals ?? 6,
            // pxDecimals non fourni par HL — on calcule depuis maxDecimals (6 pour perps)
            pxDecimals: Math.max(0, 6 - Math.floor(Math.log10(1))),
          };
        });
        setAssetMap(map);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map }));
      })
      .catch(e => console.warn('useHLMeta error:', e.message));
  }, []);

  /**
   * Retourne { index, szDecimals, pxDecimals } pour un hlKey donné
   * Gère les préfixes xyz: et hyna: automatiquement
   */
  const getAssetMeta = (hlKey) => {
    if (!hlKey) return null;
    // Retirer les préfixes xyz: hyna: pour chercher dans la meta
    const cleanKey = hlKey.replace(/^(xyz:|hyna:)/, '');
    return assetMap[cleanKey] ?? null;
  };

  return { assetMap, getAssetMeta };
}

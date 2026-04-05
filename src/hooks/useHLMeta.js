// src/hooks/useHLMeta.js

import { useState, useEffect, useCallback } from 'react';

const HL_API       = 'https://api.hyperliquid.xyz/info';
//const CACHE_KEY    = 'hl_meta_cache';
const CACHE_KEY = 'hl_meta_cache_v3'; // ← force un refetch propre
const CACHE_TTL_MS = 1000 * 60 * 60; // 1h

export function useHLMeta() {
  const [assetMap, setAssetMap] = useState(() => {
    // Hydratation initiale depuis le cache si récent
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data || {};
      }
    } catch { }
    return {};
  });

  useEffect(() => {
    // Ne pas refetch si le cache est encore valide
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS && cached.data) return;
    } catch { }

    fetch(HL_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'meta' }),
    })
      .then(r => r.json())
      .then(data => {
  const map = {};
  (data?.universe ?? []).forEach((asset, index) => {
    const entry = {
      index,
      szDecimals:  asset.szDecimals  ?? 6,
      pxDecimals:  asset.pxDecimals  ?? 2,
      tickSize:    asset.tickSize     ?? null,
      maxLeverage: asset.maxLeverage  ?? null,
    };
    // Stocker avec le nom original (ex: 'xyz:GOLD')
    map[asset.name] = entry;
    // ET sans préfixe (ex: 'GOLD') pour les deux sens de lookup
    const stripped = asset.name.replace(/^(xyz:|hyna:)/, '');
    if (stripped !== asset.name) map[stripped] = entry;
  });
  setAssetMap(map);
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map }));
})
      .catch(e => console.warn('useHLMeta error:', e.message));
  }, []);

  const getAssetMeta = useCallback((hlKey) => {
  if (!hlKey) return null;
  // Essai 1 : clé exacte (ex: 'xyz:GOLD')
  if (assetMap[hlKey]) return assetMap[hlKey];
  // Essai 2 : sans préfixe (ex: 'GOLD')
  const stripped = hlKey.replace(/^(xyz:|hyna:)/, '');
  return assetMap[stripped] ?? null;
}, [assetMap]);

  return { assetMap, getAssetMeta };
}

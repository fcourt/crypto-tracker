import { useState, useEffect, useCallback } from 'react';

const HL_API       = 'https://api.hyperliquid.xyz/info';
const CACHE_KEY    = 'hl_meta_cache_v3';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1h

export function useHLMeta() {
  const [assetMap, setAssetMap] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data || {};
    } catch { }
    return {};
  });

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS && cached.data) return;
    } catch { }

    Promise.all([
      // Assets crypto natifs HL
      fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      }).then(r => r.json()),
      // Assets HIP-3 trade.xyz (GOLD, TSLA, SP500, etc.)
      fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
      }).then(r => r.json()),
    ])
      .then(([nativeData, xyzData]) => {
        const map = {};

        // ── Assets natifs HL ──────────────────────────────────────────────
        const [nativeMeta] = Array.isArray(nativeData) ? nativeData : [null];
        (nativeMeta?.universe ?? []).forEach((asset, index) => {
          const entry = {
            index,
            szDecimals:  asset.szDecimals  ?? 6,
            pxDecimals:  asset.pxDecimals  ?? 2,
            maxLeverage: asset.maxLeverage ?? null,
          };
          map[asset.name] = entry; // ex: 'BTC'
        });

        // ── Assets HIP-3 xyz (clé avec préfixe : 'xyz:GOLD', 'xyz:TSLA'…) ─
        const [xyzMeta] = Array.isArray(xyzData) ? xyzData : [null];
        (xyzMeta?.universe ?? []).forEach((asset, index) => {
          const entry = {
            index,
            szDecimals:  asset.szDecimals  ?? 2,
            pxDecimals:  asset.pxDecimals  ?? 2,
            maxLeverage: asset.maxLeverage ?? null,
          };
          map[asset.name] = entry;                          // 'xyz:GOLD'
          const stripped  = asset.name.replace(/^xyz:/, '');
          if (stripped !== asset.name) map[stripped] = entry; // 'GOLD' aussi
        });

        setAssetMap(map);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map }));
      })
      .catch(e => console.warn('useHLMeta error:', e.message));
  }, []);

  const getAssetMeta = useCallback((hlKey) => {
    if (!hlKey) return null;
    if (assetMap[hlKey]) return assetMap[hlKey];                          // 'xyz:GOLD' exact
    const stripped = hlKey.replace(/^(xyz:|hyna:)/, '');
    return assetMap[stripped] ?? null;                                    // 'GOLD' fallback
  }, [assetMap]);

  return { assetMap, getAssetMeta };
}

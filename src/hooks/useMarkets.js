// src/hooks/useMarkets.js

import { useState, useEffect } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

// ─── Définitions statiques (sans assetIndex pour HIP-3) ──────────────────

const NATIVE_HL_STATIC = [
  { id: 'btc',  label: 'Bitcoin',  hlKey: 'BTC',  platform: 'hyperliquid', szDecimals: 5, pxDecimals: 1 },
  { id: 'eth',  label: 'Ethereum', hlKey: 'ETH',  platform: 'hyperliquid', szDecimals: 4, pxDecimals: 1 },
  { id: 'sol',  label: 'Solana',   hlKey: 'SOL',  platform: 'hyperliquid', szDecimals: 2, pxDecimals: 2 },
  // … autres perps natifs
];

const HIP3_STATIC = [
  { id: 'xau-xyz',  label: 'Or (xyz)',       hlKey: 'xyz:GOLD',   platform: 'hyperliquid', dex: 'xyz', szDecimals: 4, pxDecimals: 1 },
  { id: 'xag-xyz',  label: 'Argent (xyz)',   hlKey: 'xyz:SILVER', platform: 'hyperliquid', dex: 'xyz', szDecimals: 2, pxDecimals: 3 },
  { id: 'wti-xyz',  label: 'Pétrole (xyz)',  hlKey: 'xyz:CL',     platform: 'hyperliquid', dex: 'xyz', szDecimals: 2, pxDecimals: 2 },
  // … autres HIP-3
];

// Statique pur — pas de résolution nécessaire côté client
const EXTENDED_STATIC = [
  { id: 'xau-ext', label: 'Or (Extended)',      extKey: 'XAUUSD',  platform: 'extended', szDecimals: 4, pxDecimals: 1 },
  { id: 'xag-ext', label: 'Argent (Extended)',  extKey: 'XAGUSD',  platform: 'extended', szDecimals: 2, pxDecimals: 3 },
  // … autres Extended
];

const STATIC_FALLBACK = [
  ...NATIVE_HL_STATIC.map(m => ({ ...m, assetIndex: null })),
  ...HIP3_STATIC.map(m  => ({ ...m, assetIndex: null })),
  ...EXTENDED_STATIC,
];

// ─── Cache module-level (résolution une seule fois par session) ───────────

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

      // Index natif : position dans universe[]
      const nativeIndexMap = {};
      (nativeRes.universe ?? []).forEach((asset, i) => {
        nativeIndexMap[asset.name] = i;
      });
      const nativeCount = nativeRes.universe?.length ?? 0;

      // Index HIP-3 : nativeCount + position dans xyz universe[]
      const hip3IndexMap = {};
      (xyzRes.universe ?? []).forEach((asset, i) => {
        hip3IndexMap[asset.name] = nativeCount + i;
      });

      console.log('[MARKETS] native count:', nativeCount);
      console.log('[MARKETS] HIP-3 indices:', hip3IndexMap);

      const native = NATIVE_HL_STATIC.map(m => ({
        ...m,
        assetIndex: nativeIndexMap[m.hlKey] ?? null,
      }));

      const hip3 = HIP3_STATIC.map(m => ({
        ...m,
        assetIndex: hip3IndexMap[m.hlKey] ?? null,
      }));

      _resolvedMarkets = [...native, ...hip3, ...EXTENDED_STATIC];
      return _resolvedMarkets;

    } catch (e) {
      console.error('[MARKETS] résolution échouée, fallback statique:', e.message);
      // Fallback : retourner les statiques sans assetIndex HIP-3
      return [
        ...NATIVE_HL_STATIC.map(m => ({ ...m, assetIndex: null })),
        ...HIP3_STATIC.map(m => ({ ...m, assetIndex: null })),
        ...EXTENDED_STATIC,
      ];
    }
  })();

  return _resolvingPromise;
}

// ─── Export : accès direct (await) pour placeOrder ───────────────────────

export async function getMarkets() {
  return buildMarkets();
}

export async function getMarketByHlKey(hlKey) {
  const markets = await buildMarkets();
  return markets.find(m => m.hlKey === hlKey) ?? null;
}

// ─── Hook React : pour la liste déroulante ───────────────────────────────

export function useMarkets() {
  const [markets, setMarkets] = useState(_resolvedMarkets ?? STATIC_FALLBACK);
  const [loading, setLoading] = useState(!_resolvedMarkets);

  useEffect(() => {
    if (_resolvedMarkets) return;
    buildMarkets().then(m => {
      setMarkets(m);
      setLoading(false);
    });
  }, []);

  return { markets, loading };
}

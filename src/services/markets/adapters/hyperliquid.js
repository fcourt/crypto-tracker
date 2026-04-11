// src/services/markets/adapters/hyperliquid.js
import { getCached, setCached } from '../cache.js';

const HL_API = 'https://api.hyperliquid.xyz/info';

async function fetchUniverse(body) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HL fetch → ${res.status}`);
  const data = await res.json();
  const [meta] = Array.isArray(data) ? data : [null];
  return new Set((meta?.universe || []).map(a => a.name));
  // Noms natifs : 'BTC', 'ETH', 'SOL' …
  // Noms xyz    : 'xyz:GOLD', 'xyz:SP500' …
}

export async function fetchHLAvailableKeys() {
  const cached = getCached('hl_native');
  if (cached) return cached;
  const keys = await fetchUniverse({ type: 'metaAndAssetCtxs' });
  setCached('hl_native', keys);
  return keys;
}

export async function fetchXyzAvailableKeys() {
  const cached = getCached('hl_xyz');
  if (cached) return cached;
  const keys = await fetchUniverse({ type: 'metaAndAssetCtxs', dex: 'xyz' });
  setCached('hl_xyz', keys);
  return keys;
}

// HyENA utilise le même univers que HL natif (vérifier si différent dans ton cas)
export const fetchHyenaAvailableKeys = fetchHLAvailableKeys;

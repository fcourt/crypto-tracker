// src/services/markets/adapters/nado.js
import { getCached, setCached } from '../cache.js';

const DEAD = new Set(['not_tradable', 'reduce_only']);

export async function fetchNadoAvailableKeys() {
  const cached = getCached('nado_keys');
  if (cached) return cached;

  const res = await fetch('https://archive.prod.nado.xyz/v2/symbols');
  if (!res.ok) throw new Error(`Nado /v2/symbols → ${res.status}`);
  const raw = await res.json();

  // Retourne les bases : 'BTC', 'ETH', 'XAG', 'WTI' …
  const keys = new Set(
    Object.values(raw)
      .filter(m => !DEAD.has(m.trading_status))
      .map(m => m.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, ''))
  );

  setCached('nado_keys', keys);
  return keys;
}

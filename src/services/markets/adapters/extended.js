// src/services/markets/adapters/extended.js
import { getCached, setCached } from '../cache.js';

export async function fetchExtAvailableKeys() {
  const cached = getCached('extended_keys');
  if (cached) return cached;

  const res = await fetch(`/api/extended?endpoint=${encodeURIComponent('/info/markets')}`);
  if (!res.ok) throw new Error(`Extended /info/markets → ${res.status}`);
  const data = await res.json();

  // Retourne les `name` bruts : 'BTC-USD', 'TSLA_24_5-USD', 'SPX500m-USD' …
  const keys = new Set((data.data || []).map(m => m.name).filter(Boolean));
  setCached('extended_keys', keys);
  return keys;
}

// src/services/markets/adapters/extended.js
import { getCached, setCached } from '../cache.js';

// ─── Disponibilité (existant) ─────────────────────────────────────────────────
export async function fetchExtAvailableKeys() {
  const cached = getCached('extended_keys');
  if (cached) return cached;
  const res = await fetch(`/api/extended?endpoint=${encodeURIComponent('/info/markets')}`);
  if (!res.ok) throw new Error(`Extended /info/markets → ${res.status}`);
  const data = await res.json();
  const keys = new Set((data.data || []).map(m => m.name).filter(Boolean));
  setCached('extended_keys', keys);
  return keys;
}

// ─── Prix live ────────────────────────────────────────────────────────────────
export async function fetchExtMids() {
  const res = await fetch(`/api/extended?endpoint=${encodeURIComponent('/info/markets')}`);
  const data = await res.json();
  const priceMap = {}, precisionMap = {};
  (data.data || []).forEach(m => {
    if (!m.name) return;
    const price = parseFloat(m.marketStats?.lastPrice || 0);
    if (price) priceMap[m.name] = price;
    precisionMap[m.name] = {
      szDecimals: m.quantityPrecision ?? m.qtyPrecision ?? 2,
      pxDecimals: m.pricePrecision ?? 2,
    };
  });
  return { priceMap, precisionMap };
}

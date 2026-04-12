// src/services/markets/cache.js
const store = new Map();
//const TTL = 5 * 60 * 1000;

// src/services/markets/cache.js — ajouter un TTL variable
const TTLS = {
  nado_prices: 5_000,        // 5s — prix live
  nado_keys:   5 * 60_000,   // 5min — liste des marchés
  hl_all:      5 * 60_000,
  extended_keys: 5 * 60_000,
};
const DEFAULT_TTL = 5 * 60_000;

export const getCached = (key) => {
  const e = store.get(key);
  const ttl = TTLS[key] ?? DEFAULT_TTL;
  return e && Date.now() - e.ts < ttl ? e.data : null;
};

//export const getCached = (key)       => { const e = store.get(key); return e && Date.now()-e.ts < TTL ? e.data : null; };
export const setCached = (key, data) => store.set(key, { data, ts: Date.now() });

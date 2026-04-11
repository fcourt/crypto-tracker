// src/services/markets/cache.js
const store = new Map();
const TTL = 5 * 60 * 1000;

export const getCached = (key)       => { const e = store.get(key); return e && Date.now()-e.ts < TTL ? e.data : null; };
export const setCached = (key, data) => store.set(key, { data, ts: Date.now() });

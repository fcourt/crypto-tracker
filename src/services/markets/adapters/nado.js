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

const GATEWAY = 'https://gateway.prod.nado.xyz';
const ARCHIVE  = 'https://archive.prod.nado.xyz';

// Retourne { nadoKey: price } en joignant /v2/symbols + /v1/query
/*
export async function fetchNadoPrices() {
  const cached = getCached('nado_prices');
  if (cached) return cached;

  const [symbolsRes, productsRes] = await Promise.all([
    fetch(`${ARCHIVE}/v2/symbols`),
    fetch(`${ARCHIVE}/v1/query`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'all_products' }),
    }),
  ]);

  if (!symbolsRes.ok || !productsRes.ok)
    throw new Error(`Nado prices fetch failed`);

  const [symbolsRaw, productsRaw] = await Promise.all([
    symbolsRes.json(),
    productsRes.json(),
  ]);

  // ← AJOUTER CES LOGS
  console.log('[Nado] symbols sample:', Object.values(symbolsRaw).slice(0, 3));
  console.log('[Nado] perp_products sample:', productsRaw?.data?.perp_products?.slice(0, 3));
  console.log('[Nado] spot_products sample:', productsRaw?.data?.spot_products?.slice(0, 3));

  // product_id → nadoKey depuis /v2/symbols
  const idToKey = {};
  Object.values(symbolsRaw).forEach(s => {
    if (s.product_id != null) {
      idToKey[s.product_id] = s.symbol
        .replace(/-PERP$/, '')
        .replace(/-SPOT$/, '');
    }
  });

  // Jointure : product_id → nadoKey → price
  const prices = {};
  const SCALE  = 1e18;

  const parse = (products) => {
    (products || []).forEach(p => {
      if (!p.oracle_price_x18 || p.product_id === 0) return;
      const key   = idToKey[p.product_id];
      if (!key) return;
      const price = Number(BigInt(p.oracle_price_x18)) / SCALE;
      if (price > 0) prices[key] = price;
    });
  };

  parse(productsRaw?.data?.spot_products);
  parse(productsRaw?.data?.perp_products);

  setCached('nado_prices', prices);
  return prices; // { 'BTC': 73156.05, 'ETH': 3200.10, 'XAG': 32.4, ... }
}
*/

export async function fetchNadoPrices() {
  const cached = getCached('nado_prices');
  if (cached) return cached;

  // Étape 1 : récupérer les symbols pour avoir product_ids + nadoKey
  const symbolsRes = await fetch(`${ARCHIVE}/v2/symbols`);
  if (!symbolsRes.ok) throw new Error(`Nado /v2/symbols → ${symbolsRes.status}`);
  const symbolsRaw = await symbolsRes.json();

  // Construire idToKey ET la liste des product_ids actifs
  const idToKey = {};
  const productIds = [];

  Object.values(symbolsRaw).forEach(s => {
    const pid = s.product_id ?? s.productId ?? null;
    if (pid != null && pid !== 0) {
      idToKey[pid] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, '');
      productIds.push(pid);
    }
  });

  // Étape 2 : requête market_prices avec la liste des IDs
  const pricesRes = await fetch(`${GATEWAY}/v1/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      type:        'market_prices',
      product_ids: productIds,       // ← obligatoire
    }),
  });

  if (!pricesRes.ok) throw new Error(`Nado prices fetch failed → ${pricesRes.status}`);
  const pricesRaw = await pricesRes.json();

  // Étape 3 : extraire les prix (mid = (bid + ask) / 2)
  const prices = {};
  const SCALE  = 1e18;

  (pricesRaw?.data?.market_prices || []).forEach(p => {
    const key = idToKey[p.product_id];
    if (!key) return;
    const bid = parseFloat(p.bid_x18);
    const ask = parseFloat(p.ask_x18);
    // Ignorer les marchés sans liquidité (ask = max int128)
    if (!bid || !ask || ask > 1e35) return;
    prices[key] = (bid + ask) / 2 / SCALE;
  });

  console.log('[Nado] prix extraits:', prices);

  if (Object.keys(prices).length > 0) setCached('nado_prices', prices);
  return prices;
}

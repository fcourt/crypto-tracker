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

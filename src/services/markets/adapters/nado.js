// src/services/markets/adapters/nado.js
import { getCached, setCached } from '../cache.js';

const DEAD = new Set(['not_tradable', 'reduce_only']);

// ─── Endpoints ────────────────────────────────────────────────────────────────
const GATEWAY_PROXY = '/api/nado';                        // POST → gateway.prod.nado.xyz/v1/query
const ARCHIVE       = 'https://archive.prod.nado.xyz';    // GET  → direct (pas de CORS sur archive)

// ─── Helper : POST via proxy gateway ─────────────────────────────────────────
async function gatewayPost(body) {
  const res = await fetch(GATEWAY_PROXY, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Nado gateway proxy → ${res.status}`);
  return res.json();
}

// ─── Helper : GET archive ─────────────────────────────────────────────────────
async function archiveGet(path) {
  const res = await fetch(`${ARCHIVE}${path}`);
  if (!res.ok) throw new Error(`Nado archive ${path} → ${res.status}`);
  return res.json();
}

// ─── Available keys ───────────────────────────────────────────────────────────
export async function fetchNadoAvailableKeys() {
  const cached = getCached('nado_keys');
  if (cached) return cached;

  const raw  = await archiveGet('/v2/symbols');
  const keys = new Set(
    Object.values(raw)
      .filter(m => !DEAD.has(m.trading_status))
      .map(m => m.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, ''))
  );

  setCached('nado_keys', keys);
  return keys;
}

// ─── Symboles Nado (product_id + décimales) ──────────────────────────────────
export async function fetchNadoSymbols() {
  const cached = getCached('nado_symbols');
  if (cached) return cached;

  const raw   = await archiveGet('/v2/symbols');
  const index = {};

  Object.values(raw).forEach(data => {
    if (data.type !== 'perp')          return;
    if (DEAD.has(data.trading_status)) return;

    const base     = data.symbol.replace(/-PERP$/, '');
    const priceInc = Number(data.price_increment_x18) / 1e18;
    const sizeInc  = Number(data.size_increment)      / 1e18;

    index[base] = {
      nadoProductId:  data.product_id ?? data.productId,
      nadoPxDecimals: priceInc > 0 ? Math.max(0, Math.ceil(-Math.log10(priceInc))) : 2,
      nadoSzDecimals: sizeInc  > 0 ? Math.max(0, Math.ceil(-Math.log10(sizeInc)))  : 6,
    };
  });

  if (Object.keys(index).length > 0) setCached('nado_symbols', index);
  return index;
}

// ─── Prix Nado ────────────────────────────────────────────────────────────────
export async function fetchNadoPrices() {
  const cached = getCached('nado_prices');
  if (cached) return cached;

  // Étape 1 : récupérer les symbols via archive
  const symbolsRaw = await archiveGet('/v2/symbols');

  const idToKey    = {};
  const productIds = [];

  Object.values(symbolsRaw).forEach(s => {
    const pid = s.product_id ?? s.productId ?? null;
    if (pid != null && pid !== 0) {
      idToKey[pid] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, '');
      productIds.push(pid);
    }
  });

  // Étape 2 : prix via proxy gateway
  const pricesRaw = await gatewayPost({
    type:        'market_prices',
    product_ids: productIds,
  });

  // Étape 3 : mid = (bid + ask) / 2
  const prices = {};
  const SCALE  = 1e18;

  (pricesRaw?.data?.market_prices || []).forEach(p => {
    const key = idToKey[p.product_id];
    if (!key) return;
    const bid = parseFloat(p.bid_x18);
    const ask = parseFloat(p.ask_x18);
    if (!bid || !ask || ask > 1e35) return;
    prices[key] = (bid + ask) / 2 / SCALE;
  });

  console.log('[Nado] prix extraits:', prices);

  if (Object.keys(prices).length > 0) setCached('nado_prices', prices);
  return prices;
}

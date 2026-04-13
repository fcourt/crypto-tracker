import { useState, useEffect } from 'react';
//import { MARKETS } from './useLivePrices';

const HL_API = 'https://api.hyperliquid.xyz/info';

// Récupère les funding rates natifs HL (crypto) + HIP-3 trade.xyz en parallèle
async function fetchAllFundingRates() {
  const [resNative, resXyz] = await Promise.all([
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    }),
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' }),
    }),
  ]);

  const [nativeData, xyzData] = await Promise.all([
    resNative.json(),
    resXyz.json(),
  ]);

  const rates = {};

  // Perps natifs HL (crypto)
  const [nativeMeta, nativeCtxs] = Array.isArray(nativeData) ? nativeData : [null, null];
  (nativeMeta?.universe || []).forEach((asset, i) => {
    const rate = parseFloat(nativeCtxs?.[i]?.funding ?? 0);
    rates[asset.name] = rate;
  });

  // Marchés HIP-3 trade.xyz → clé préfixée "xyz:"
  const [xyzMeta, xyzCtxs] = Array.isArray(xyzData) ? xyzData : [null, null];
  (xyzMeta?.universe || []).forEach((asset, i) => {
    const rate = parseFloat(xyzCtxs?.[i]?.funding ?? 0);
    rates[asset.name] = rate; // asset.name est déjà "xyz:TSLA" etc.
  });

  return rates;
}
/*
async function fetchExtFundingRate(extKey, apiKey) {
  if (!extKey || !apiKey) return null;
  try {
    const res = await fetch(
      `/api/extended?endpoint=${encodeURIComponent('/info/markets')}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const market = (data.data || []).find(m => m.name === extKey);
    if (!market) return null;
    return parseFloat(market.marketStats?.fundingRate ?? null);
  } catch {
    return null;
  }
}
*/
// Retourne le funding rate pour un marché sur une plateforme donnée
function getRateFromMap(rates, marketId, platformId, markets) {
  const market = markets.find(m => m.id === marketId);
  if (!market) return null;

  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId)) {
    const key = market.hlKey;
    if (!key) return null;
    return rates[key] ?? null;
  }
  return null; // extended géré séparément via API
}

async function fetchExtMarketData(extKey, apiKey) {
  if (!extKey || !apiKey) return { fundingRate: null, bid: null, ask: null };
  try {
    const res = await fetch(
      `/api/extended?endpoint=${encodeURIComponent('/info/markets')}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    if (!res.ok) return { fundingRate: null, bid: null, ask: null };
    const data   = await res.json();
    const market = (data.data || []).find(m => m.name === extKey);
    if (!market) return { fundingRate: null, bid: null, ask: null };
    return {
      fundingRate: parseFloat(market.marketStats?.fundingRate ?? null),
      bid:         parseFloat(market.marketStats?.bidPrice   ?? null),
      ask:         parseFloat(market.marketStats?.askPrice   ?? null),
    };
  } catch {
    return { fundingRate: null, bid: null, ask: null };
  }
}

/*
const NADO_ARCHIVE = 'https://archive.prod.nado.xyz';

async function fetchNadoFundingRates() {
  try {
    const [symbolsRes, productsRes] = await Promise.all([
      fetch(`${NADO_ARCHIVE}/v2/symbols`),
      fetch(`${NADO_ARCHIVE}/v1/query`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'all_products' }),
      }),
    ]);
    if (!symbolsRes.ok || !productsRes.ok) return {};

    const [symbolsRaw, productsRaw] = await Promise.all([
      symbolsRes.json(),
      productsRes.json(),
    ]);

    // product_id → nadoKey
    const idToKey = {};
    Object.values(symbolsRaw).forEach(s => {
      if (s.product_id != null)
        idToKey[s.product_id] = s.symbol.replace(/-PERP$/, '').replace(/-SPOT$/, '');
    });

    const rates = {};
    const SCALE = 1e18;

    // Funding rate uniquement sur les perp_products
    (productsRaw?.data?.perp_products || []).forEach(p => {
      if (!p.product_id) return;
      const key  = idToKey[p.product_id];
      if (!key) return;
      // Champ funding_rate_x18 ou dans state selon la version API
      const raw  = p.state?.funding_rate_x18 ?? p.funding_rate_x18 ?? null;
      if (raw != null) rates[key] = Number(BigInt(raw)) / SCALE;
    });

    return rates; // { 'BTC': 0.0001, 'ETH': 0.00008, ... }
  } catch (e) {
    console.warn('fetchNadoFundingRates error:', e.message);
    return {};
  }
}
*/

async function fetchNadoFundingRates(idToKey, productIds) {
  try {
    const res = await fetch('https://archive.prod.nado.xyz/v1', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funding_rates: {          // ← wrapper obligatoire
          product_ids: productIds,
        },
      }),
    });

    if (!res.ok) {
      console.warn('[Nado funding] status:', res.status);
      return {};
    }

    const raw = await res.json();
    // raw = { "2": { product_id, funding_rate_x18, update_time }, "4": {...}, ... }

    const SCALE = 1e18;
    const rates = {};

    Object.values(raw).forEach(p => {
      const key = idToKey[p.product_id];
      if (!key) return;
      rates[key] = parseFloat(p.funding_rate_x18) / SCALE;
    });

    console.log('[Nado funding] rates extraits:', rates);
    return rates;

  } catch (e) {
    console.warn('[Nado funding] error:', e.message);
    return {};
  }
}

export function useFundingRates(marketId, platform1Id, platform2Id, extApiKey = '', markets = []) {
  const [rates, setRates] = useState({ p1: null, p2: null, extBid: null, extAsk: null });

  useEffect(() => {
    if (!marketId || !platform1Id || !platform2Id) return;

    const refresh = async () => {
  try {
    const market = markets.find(m => m.id === marketId);

    // Fetch toutes les sources en parallèle
    const needsNado = platform1Id === 'nado' || platform2Id === 'nado';
    const [hlRates, nadoRates] = await Promise.all([
      fetchAllFundingRates(),
      needsNado ? fetchNadoFundingRates() : Promise.resolve({}),
    ]);

    let extBid = null, extAsk = null;

    const resolveRate = async (platformId) => {
      if (platformId === 'extended') {
        return fetchExtMarketData(market?.extKey, extApiKey).then(d => {
          extBid = d.bid; extAsk = d.ask; return d.fundingRate;
        });
      }
      if (platformId === 'nado') {
        const key = market?.nadoKey;
        return key ? (nadoRates[key] ?? null) : null;
      }
      // HL natif / xyz / hyena
      return getRateFromMap(hlRates, marketId, platformId, markets);
    };

    const [p1, p2] = await Promise.all([
      resolveRate(platform1Id),
      resolveRate(platform2Id),
    ]);

    setRates({ p1, p2, extBid, extAsk });
  } catch (e) {
    console.warn('useFundingRates error:', e.message);
  }
};
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [marketId, platform1Id, platform2Id, extApiKey, markets]);

  return rates;
}

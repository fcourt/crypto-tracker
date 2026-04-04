// src/hooks/useExtendedL2Config.js
// Charge dynamiquement les L2 configs depuis l'API Extended au démarrage

const CACHE_KEY     = 'ext_l2configs_cache';
const CACHE_TTL_MS  = 60 * 60 * 1000; // 1 heure

let _configCache = null; // cache en mémoire (session)

// Dérive pxDecimals depuis minPriceChange (ex: "0.01" → 2, "0.1" → 1, "10" → -1→0)
function pxDecimalsFromMinPrice(minPriceChange) {
  const v = parseFloat(minPriceChange);
  if (!v || v <= 0) return 2;
  return Math.max(0, Math.round(-Math.log10(v)));
}

// Charge et met en cache les configs L2 de tous les marchés
export async function loadExtendedL2Configs() {
  // 1. Cache mémoire (même session)
  if (_configCache) return _configCache;

  // 2. Cache localStorage (entre sessions, TTL 1h)
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (stored && Date.now() - stored.ts < CACHE_TTL_MS) {
      _configCache = stored.configs;
      return _configCache;
    }
  } catch { /* ignore */ }

  // 3. Fetch depuis l'API
  const res  = await fetch('/api/extended?endpoint=/info/markets');
  const data = await res.json();

  const configs = {};
  for (const m of (data?.data || [])) {
    const l2  = m.l2Config || {};
    const tc  = m.tradingConfig || {};
    configs[m.name] = {
      syntheticId:          l2.syntheticId,
      syntheticResolution:  l2.syntheticResolution,
      collateralResolution: l2.collateralResolution,
      szDecimals:           m.assetPrecision ?? 0,
      pxDecimals:           pxDecimalsFromMinPrice(tc.minPriceChange),
    };
  }

  _configCache = configs;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), configs }));
  } catch { /* ignore */ }

  return configs;
}

// Invalide le cache (utile pour forcer un rechargement)
export function clearExtendedL2ConfigCache() {
  _configCache = null;
  localStorage.removeItem(CACHE_KEY);
}

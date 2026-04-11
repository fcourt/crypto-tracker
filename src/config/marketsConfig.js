// src/config/marketsConfig.js
// ─── Overrides nécessaires uniquement quand l'id ≠ strip("xyz:", hlKey) ──────
// Seulement 5 cas sur 37 !
export const HL_KEY_OVERRIDES = {
  'xyz:XYZ100':   { id: 'NASDAQ' },
  'xyz:CL':       { id: 'OIL'    },
  'xyz:BRENTOIL': { id: 'BRENT'  },
  'xyz:PLATINUM': { id: 'PLAT'   },
  'xyz:NATGAS':   { id: 'NGAS'   },
};

// ─── Labels custom (quand le symbole brut n'est pas lisible) ──────────────────
export const MARKET_LABELS = {
  NASDAQ: 'Nasdaq',     OIL:       'WTI Oil',    BRENT:    'Brent',
  PLAT:   'Platinum',   NGAS:      'Nat. Gas',   SP500:    'S&P 500',
  JP225:  'Nikkei 225', GOLD:      'Gold',       SILVER:   'Silver',
  COPPER: 'Copper',     PALLADIUM: 'Palladium',  URANIUM:  'Uranium',
  COIN:   'Coinbase',   PLTR:      'Palantir',   MSTR:     'MicroStrategy',
  GOOGL:  'Google',     META:      'Meta',       LLY:      'Eli Lilly',
  TSM:    'TSMC',       HOOD:      'Robinhood',  CRCL:     'Circle',
  SNDK:   'SanDisk',    NFLX:      'Netflix',    ORCL:     'Oracle',
};

// ─── Catégories ────────────────────────────────────────────────────────────────
const INDICES    = new Set(['SP500','NASDAQ','JP225','VIX','DXY']);
const COMMOS     = new Set(['GOLD','SILVER','OIL','BRENT','COPPER','PLAT','PALLADIUM','NGAS','URANIUM']);

export function inferCategory(id) {
  if (INDICES.has(id))  return 'Indices';
  if (COMMOS.has(id))   return 'Commodités';
  return 'Equities'; // xyz: non-catégorisé → Equities par défaut
}

// ─── extKey (plateforme Extended) ─────────────────────────────────────────────
// Règles de dérivation automatique :
//   Crypto       → `${id}-USD`            (BTC-USD, ETH-USD, SOL-USD)
//   Equities HL  → `${id}_24_5-USD`       (TSLA_24_5-USD, AAPL_24_5-USD …)
//   Commodités/Indices → manuel si différent
export const EXT_KEY_OVERRIDES = {
  GOLD:   'XAU-USD',   SILVER:  'XAG-USD',   OIL:    'WTI-USD',
  BRENT:  'XBR-USD',   COPPER:  'XCU-USD',   PLAT:   'XPT-USD',
  NGAS:   'XNG-USD',   SP500:   'SPX500m-USD',NASDAQ: 'TECH100m-USD',
  // JP225, VIX, DXY, PALLADIUM, URANIUM → pas de extKey (null)
};

// ─── nadoKey (Nado) ───────────────────────────────────────────────────────────
// La plupart : nadoKey = id  (BTC→BTC, TSLA→TSLA)
// Exceptions :
export const NADO_KEY_OVERRIDES = {
  SILVER: 'XAG',
  OIL:    'WTI',
};

// ─── Marchés Nado-only (pas encore dans HL/Extended) ──────────────────────────
// Ces marchés n'apparaissent pas dans HL meta, il faut les déclarer ici
// pour qu'ils soient visibles si Nado est la seule plateforme sélectionnée.
export const NADO_ONLY_MARKETS = [
  { id: 'XRP',      label: 'XRP',        nadoKey: 'XRP',      category: 'Crypto' },
  { id: 'BNB',      label: 'BNB',        nadoKey: 'BNB',      category: 'Crypto' },
  { id: 'HYPE',     label: 'HYPE',       nadoKey: 'HYPE',     category: 'Crypto' },
  { id: 'SUI',      label: 'SUI',        nadoKey: 'SUI',      category: 'Crypto' },
  { id: 'DOGE',     label: 'DOGE',       nadoKey: 'DOGE',     category: 'Crypto' },
  { id: 'AAVE',     label: 'AAVE',       nadoKey: 'AAVE',     category: 'Crypto' },
  { id: 'LINK',     label: 'LINK',       nadoKey: 'LINK',     category: 'Crypto' },
  { id: 'EURUSD',   label: 'EUR/USD',    nadoKey: 'EURUSD',   category: 'FX'     },
  { id: 'GBPUSD',   label: 'GBP/USD',    nadoKey: 'GBPUSD',   category: 'FX'     },
  { id: 'USDJPY',   label: 'USD/JPY',    nadoKey: 'USDJPY',   category: 'FX'     },
  { id: 'SPY',      label: 'SPY ETF',    nadoKey: 'SPY',      category: 'Indices'},
  { id: 'QQQ',      label: 'QQQ ETF',    nadoKey: 'QQQ',      category: 'Indices'},
  // Ajoute les autres Nado-only si besoin (BCH, ZEC, TAO, XMR…)
];

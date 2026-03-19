const EXTENDED_API = 'https://api.starknet.extended.exchange/api/v1';

function safeFloat(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

async function extendedGet(endpoint, apiKey) {
  const res = await fetch(`${EXTENDED_API}${endpoint}`, {
    headers: {
      'X-Api-Key': apiKey,
      'User-Agent': 'PerpTracker/1.0',
    },
  });
  if (res.status === 404) return null; // balance à 0 retourne 404
  if (!res.ok) throw new Error(`Extended API ${res.status}`);
  const data = await res.json();
  if (data.status === 'ERROR') throw new Error(data.error?.message || 'Extended API error');
  return data.data;
}

export async function fetchExtendedData(apiKey) {
  if (!apiKey?.trim()) throw new Error('Clé API Extended manquante');

  const [balance, positions, trades] = await Promise.all([
    extendedGet('/user/balance', apiKey).catch(() => null),
    extendedGet('/user/positions', apiKey).catch(() => []),
    extendedGet('/user/fills',      apiKey).catch(() => []),
  ]);

  // Calculs
  const pnl = (positions || []).reduce(
    (acc, p) => acc + safeFloat(p.realisedPnl), 0
  );
  const fees = (trades || []).reduce(
    (acc, t) => acc + safeFloat(t.fee), 0
  );
  const volume = (trades || []).reduce(
    (acc, t) => acc + safeFloat(t.price) * safeFloat(t.quantity), 0
  );

  return {
    pnl,
    fees,
    fundingNet:       0, // endpoint funding séparé à implémenter si besoin
    volume,
    marginAvailable:  safeFloat(balance?.availableForTrade),
    equity:           safeFloat(balance?.equity),
    unrealisedPnl:    safeFloat(balance?.unrealisedPnl),
    tradeCount:       (trades || []).length,
    available:        true,
    marginToken:      balance?.collateralName || 'USDC',
  };
}

// Sauvegarde/lecture clé API Extended dans localStorage
const STORAGE_KEY = 'extended_api_keys';

export function getExtendedApiKeys() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

export function saveExtendedApiKey(apiKey, label = '') {
  const keys = getExtendedApiKeys();
  if (keys.find(k => k.apiKey === apiKey)) return;
  keys.push({ apiKey, label: label || apiKey.slice(0, 8) + '...' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function removeExtendedApiKey(apiKey) {
  const keys = getExtendedApiKeys().filter(k => k.apiKey !== apiKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

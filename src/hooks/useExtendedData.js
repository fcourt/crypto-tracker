async function extendedGet(endpoint, apiKey) {
  const res = await fetch(
    `/api/extended?endpoint=${encodeURIComponent(endpoint)}`,
    { headers: { 'X-Api-Key': apiKey } }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Extended ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.status === 'ERROR') throw new Error(data.error?.message || 'Extended API error');
  return data.data;
}

function safeFloat(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function computePnl(trades) {
  // Grouper par market, calculer SELL value - BUY value par market
  const byMarket = {};
  for (const t of trades) {
    if (!byMarket[t.market]) byMarket[t.market] = { buy: 0, sell: 0 };
    if (t.side === 'BUY')  byMarket[t.market].buy  += safeFloat(t.value);
    if (t.side === 'SELL') byMarket[t.market].sell += safeFloat(t.value);
  }
  // PnL = somme des (SELL - BUY) sur les positions fermées
  return Object.values(byMarket).reduce(
    (acc, { buy, sell }) => acc + (sell - buy), 0
  );
}

export async function fetchExtendedData(apiKey) {
  if (!apiKey?.trim()) throw new Error('Clé API Extended manquante');

  const [balance, trades] = await Promise.all([
    extendedGet('/user/balance', apiKey).catch(() => null),
    extendedGet('/user/trades',  apiKey).catch(() => []),
  ]);

  const tradeList = trades || [];

  const fees   = tradeList.reduce((acc, t) => acc + safeFloat(t.fee),   0);
  const volume = tradeList.reduce((acc, t) => acc + safeFloat(t.value), 0);
  const pnl    = computePnl(tradeList);

  return {
    pnl,
    fees,
    fundingNet:      0,
    volume,
    marginAvailable: safeFloat(balance?.availableForTrade),
    equity:          safeFloat(balance?.equity),
    unrealisedPnl:   safeFloat(balance?.unrealisedPnl),
    tradeCount:      tradeList.length,
    available:       true,
    marginToken:     balance?.collateralName || 'USD',
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

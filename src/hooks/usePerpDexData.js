const HL_API = 'https://api.hyperliquid.xyz/info';

const PROTOCOLS = [
  { id: 'hyperliquid', label: 'Hyperliquid',  url: 'https://app.hyperliquid.xyz/trade',  color: 'blue' },
  { id: 'xyz',         label: 'trade.xyz',     url: 'https://app.trade.xyz/',             color: 'purple' },
  { id: 'hyena',       label: 'HyENA',         url: 'https://app.hyena.trade/',           color: 'orange' },
  { id: 'extended',    label: 'Extended',      url: 'https://app.extended.exchange/perp', color: 'cyan' },
  { id: 'variational', label: 'Variational',   url: 'https://omni.variational.io/',       color: 'pink' },
  { id: 'legend',      label: 'Legend Trade',  url: 'https://app.legend.trade/',          color: 'yellow' },
];

export { PROTOCOLS };

function getFillProtocol(coin) {
  if (!coin || typeof coin !== 'string') return 'other';
  if (coin.startsWith('xyz:'))  return 'xyz';
  if (coin.startsWith('hyna:')) return 'hyena';
  if (coin.includes(':'))       return 'other';
  return 'hyperliquid';
}

function safeFloat(val) {
  if (val === null || val === undefined) return 0;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Filtre un tableau d'items par plage de dates
// dateField : nom du champ timestamp (en ms ou en secondes)
export function filterByDate(items, dateField, dateRange) {
  if (!dateRange?.from || !Array.isArray(items)) return items;
  return items.filter(item => {
    const ts = item[dateField];
    if (ts === undefined || ts === null) return false;
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    return d >= dateRange.from && d <= dateRange.to;
  });
}

async function fetchHLData(address) {
  const [fillsRes, fundingRes, stateRes] = await Promise.all([
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFills', user: address }),
    }),
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFunding',
        user: address,
        startTime: Date.now() - 30 * 86400000,
        endTime: Date.now(),
      }),
    }),
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
    }),    
  ]);

  const [fills, funding, state] = await Promise.all([
    fillsRes.json(),
    fundingRes.json(),
    stateRes.json(),
  ]);

  const { fills } = await fetchHLData(address);
  const xyzFills = fills.filter(f => f.coin?.startsWith('xyz:'));
  console.log('XYZ coins:', [...new Set(xyzFills.map(f => f.coin))]);
  
  return { fills: fills || [], funding: funding || [], state };
}

export async function fetchSubAccounts(masterAddress) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'subAccounts', user: masterAddress }),
  });
  if (!res.ok) throw new Error(`subAccounts HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchPerpDexData(address, selectedProtocols, dateRange) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Adresse invalide');
  }

  const { fills, funding, state } = await fetchHLData(address);

  // Filtrage par période sur le champ 'time' (ms dans l'API HL)
  const filteredFills   = filterByDate(fills,   'time', dateRange);
  const filteredFunding = filterByDate(funding, 'time', dateRange);

  let usdeBalance = 0;
  let usdcBalance = 0;

  if (state?.crossMarginSummary) {
    const accountValue    = safeFloat(state.crossMarginSummary.accountValue);
    const totalMarginUsed = safeFloat(state.crossMarginSummary.totalMarginUsed);
    usdcBalance = accountValue - totalMarginUsed;
  }
  if (state?.withdrawable) {
    usdeBalance = safeFloat(state.withdrawable);
  }
  if (Array.isArray(state?.balances)) {
    const usde = state.balances.find(b => (b.coin || b.token || '').toUpperCase() === 'USDE');
    const usdc = state.balances.find(b => (b.coin || b.token || '').toUpperCase() === 'USDC');
    if (usde) usdeBalance = safeFloat(usde.hold || usde.total || usde.balance);
    if (usdc) usdcBalance = safeFloat(usdc.hold || usdc.total || usdc.balance);
  }

  const results = {};

  selectedProtocols.forEach(protocolId => {
    const protocolFills = filteredFills.filter(f => {
      const fp = getFillProtocol(f.coin);
      if (protocolId === 'hyperliquid') return fp === 'hyperliquid';
      if (protocolId === 'xyz')         return fp === 'xyz';
      if (protocolId === 'hyena')       return fp === 'hyena';
      return false;
    });

    const protocolFunding = filteredFunding.filter(f => {
      const fp = getFillProtocol(f.delta?.coin);
      if (protocolId === 'hyperliquid') return fp === 'hyperliquid';
      if (protocolId === 'xyz')         return fp === 'xyz';
      if (protocolId === 'hyena')       return fp === 'hyena';
      return false;
    });

    const pnl        = protocolFills.reduce((acc, f) => acc + safeFloat(f.closedPnl), 0);
    const fees       = protocolFills.reduce((acc, f) => acc + safeFloat(f.fee), 0);
    const fundingNet = protocolFunding.reduce((acc, f) => acc + safeFloat(f.delta?.usdc), 0);
    const volume     = protocolFills.reduce((acc, f) =>
      acc + safeFloat(f.px) * safeFloat(f.sz), 0
    );

    let marginAvailable = 0;
    if (['hyperliquid', 'xyz', 'hyena'].includes(protocolId)) {
      marginAvailable = protocolId === 'hyena' ? usdeBalance : usdcBalance;
    }

    results[protocolId] = {
      pnl,
      fees,
      fundingNet,
      volume,
      marginAvailable,
      tradeCount: protocolFills.length,
      available: ['hyperliquid', 'xyz', 'hyena'].includes(protocolId),
      marginToken: protocolId === 'hyena' ? 'USDE' : 'USDC',
    };
  });

  return results;
}

export async function fetchPerpDexDataWithSubs(address, selectedProtocols, includeSubAccounts = false, dateRange) {
  const mainData = await fetchPerpDexData(address, selectedProtocols, dateRange);

  if (!includeSubAccounts) return { main: mainData, subAccounts: [] };

  let subAccounts = [];
  try {
    subAccounts = await fetchSubAccounts(address);
  } catch (e) {
    console.warn('Impossible de récupérer les sub-accounts:', e.message);
  }

  const subData = await Promise.all(
    subAccounts.map(async sub => {
      try {
        const d = await fetchPerpDexData(sub.subAccountUser, selectedProtocols, dateRange);
        return { address: sub.subAccountUser, name: sub.name || 'Sub-account', data: d };
      } catch (e) {
        return { address: sub.subAccountUser, name: sub.name, data: null, error: e.message };
      }
    })
  );

  return { main: mainData, subAccounts: subData };
}

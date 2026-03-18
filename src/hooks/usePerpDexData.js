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

// Détecte le protocole d'un fill par son préfixe de coin
function getFillProtocol(coin) {
  if (coin.startsWith('xyz:'))  return 'xyz';
  if (coin.startsWith('hyna:')) return 'hyena';
  if (coin.includes(':'))       return 'other';
  return 'hyperliquid';
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

  return { fills: fills || [], funding: funding || [], state };
}

export async function fetchPerpDexData(address, selectedProtocols) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Adresse invalide');
  }

  const { fills, funding, state } = await fetchHLData(address);

  const results = {};

  selectedProtocols.forEach(protocolId => {
    // Filtre les fills selon le protocole
    const protocolFills = fills.filter(f => {
      const fp = getFillProtocol(f.coin);
      if (protocolId === 'hyperliquid') return fp === 'hyperliquid';
      if (protocolId === 'xyz')         return fp === 'xyz';
      if (protocolId === 'hyena')       return fp === 'hyena';
      return false; // extended, variational, legend : pas encore d'API
    });

    // Filtre le funding selon le protocole
    const protocolFunding = funding.filter(f => {
      const fp = getFillProtocol(f.coin);
      if (protocolId === 'hyperliquid') return fp === 'hyperliquid';
      if (protocolId === 'xyz')         return fp === 'xyz';
      if (protocolId === 'hyena')       return fp === 'hyena';
      return false;
    });

    // Calculs
    const pnl   = protocolFills.reduce((acc, f) => acc + parseFloat(f.closedPnl || 0), 0);
    const fees  = protocolFills.reduce((acc, f) => acc + parseFloat(f.fee || 0), 0);
    const fundingNet = protocolFunding.reduce((acc, f) => acc + parseFloat(f.usdc || 0), 0);
    const volume = protocolFills.reduce((acc, f) =>
      acc + parseFloat(f.px) * parseFloat(f.sz), 0
    );

    // Margin disponible depuis clearinghouseState
    let marginAvailable = 0;
    if (state?.crossMarginSummary && (protocolId === 'hyperliquid' || protocolId === 'xyz' || protocolId === 'hyena')) {
      marginAvailable = parseFloat(state.crossMarginSummary.accountValue || 0)
        - parseFloat(state.crossMarginSummary.totalMarginUsed || 0);
    }

    results[protocolId] = {
      pnl,
      fees,
      fundingNet,
      volume,
      marginAvailable,
      tradeCount: protocolFills.length,
      available: protocolId !== 'extended' && protocolId !== 'variational' && protocolId !== 'legend',
    };
  });

  return results;
}

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

// Parse proprement un nombre qui peut être string avec . ou ,
function safeFloat(val) {
  if (val === null || val === undefined) return 0;
  const str = String(val).replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

async function fetchHLData(address) {
  const [fillsRes, fundingRes, stateRes] = await Promise.all([
    fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFills', user: address }),
    }),
    // userFunding retourne TOUT l'historique funding y compris positions ouvertes
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

  console.log('HL State sample:', JSON.stringify(state, null, 2));
  console.log('Funding sample:', JSON.stringify((funding || []).slice(0, 3), null, 2));

  return { fills: fills || [], funding: funding || [], state };
}

export async function fetchPerpDexData(address, selectedProtocols) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Adresse invalide');
  }

  const { fills, funding, state } = await fetchHLData(address);

  // Récupère le solde USDE depuis les balances cross-margin
  // state.crossMarginSummary.accountValue = valeur totale en USD
  // state.assetPositions = positions ouvertes
  // Pour USDE spécifiquement : cherche dans les balances
  let usdeBalance = 0;
  let usdcBalance = 0;

  if (state?.crossMarginSummary) {
    // accountValue inclut USDC + USDE + PnL non réalisé
    const accountValue    = safeFloat(state.crossMarginSummary.accountValue);
    const totalMarginUsed = safeFloat(state.crossMarginSummary.totalMarginUsed);
    usdcBalance = accountValue - totalMarginUsed;
  }

  // Cherche USDE dans les withdrawable ou dans les token balances
  if (state?.withdrawable) {
    usdeBalance = safeFloat(state.withdrawable);
  }

  // Certaines versions de l'API retournent les balances séparément
  if (Array.isArray(state?.balances)) {
    const usde = state.balances.find(b =>
      (b.coin || b.token || '').toUpperCase() === 'USDE'
    );
    const usdc = state.balances.find(b =>
      (b.coin || b.token || '').toUpperCase() === 'USDC'
    );
    if (usde) usdeBalance = safeFloat(usde.hold || usde.total || usde.balance);
    if (usdc) usdcBalance = safeFloat(usdc.hold || usdc.total || usdc.balance);
  }

  const results = {};

  selectedProtocols.forEach(protocolId => {
    const protocolFills = fills.filter(f => {
      const fp = getFillProtocol(f.coin);
      if (protocolId === 'hyperliquid') return fp === 'hyperliquid';
      if (protocolId === 'xyz')         return fp === 'xyz';
      if (protocolId === 'hyena')       return fp === 'hyena';
      return false;
    });

    const protocolFunding = funding.filter(f => {
      const fp = getFillProtocol(f.coin);
      if (protocolId === 'hyperliquid') return fp === 'hyperliquid';
      if (protocolId === 'xyz')         return fp === 'xyz';
      if (protocolId === 'hyena')       return fp === 'hyena';
      return false;
    });

    const pnl        = protocolFills.reduce((acc, f) => acc + safeFloat(f.closedPnl), 0);
    const fees       = protocolFills.reduce((acc, f) => acc + safeFloat(f.fee), 0);
    const fundingNet = protocolFunding.reduce((acc, f) => acc + safeFloat(f.usdc), 0);
    const volume     = protocolFills.reduce((acc, f) =>
      acc + safeFloat(f.px) * safeFloat(f.sz), 0
    );

    // Margin disponible : USDE pour HyENA, USDC pour les autres
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

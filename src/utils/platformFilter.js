// Coins déployés par HyENA sur HIP-3
// Source: https://beacontrade.io/coins (tag "HIP-3 Hyena")
export const HYENA_COINS = [
  'FARTCOIN', 'IP', 'LTC', 'HYPE', 'BOME', 'WIF', 'BONK',
  // à compléter via l'API méta: https://api.hyperliquid.xyz/info {type: "meta"}
];

// Coins déployés par trade.xyz sur HIP-3
// Source: https://beacontrade.io/coins (tag "HIP-3 XYZ")
export const XYZ_COINS = [
  'NVDA', 'MSTR', 'TSM', 'GOLD', 'BRENTOIL', 'AAPL', 'TSLA',
  // à compléter via l'API méta
];

export function filterByPlatform(fills, platform) {
  switch (platform) {
    case 'xyz':
      return fills.filter(f => XYZ_COINS.includes(f.coin));
    case 'hyena':
      return fills.filter(f => HYENA_COINS.includes(f.coin));
    case 'hyperliquid':
    default:
      // Les perps natifs HL = ceux qui ne sont ni XYZ ni HyENA
      return fills.filter(
        f => !XYZ_COINS.includes(f.coin) && !HYENA_COINS.includes(f.coin)
      );
  }
}

export function computeStats(fills) {
  return fills.reduce(
    (acc, fill) => {
      const notional = parseFloat(fill.px) * parseFloat(fill.sz);
      acc.volume += notional;
      acc.fees += parseFloat(fill.fee || 0);
      acc.pnl += parseFloat(fill.closedPnl || 0);
      acc.count += 1;
      return acc;
    },
    { volume: 0, fees: 0, pnl: 0, count: 0 }
  );
}

export function groupVolumeByDay(fills) {
  const map = {};
  fills.forEach(fill => {
    const day = new Date(fill.time).toISOString().split('T')[0];
    const notional = parseFloat(fill.px) * parseFloat(fill.sz);
    map[day] = (map[day] || 0) + notional;
  });
  return Object.entries(map)
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

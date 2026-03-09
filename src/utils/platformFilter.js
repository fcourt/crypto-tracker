export function getPlatform(coin) {
  if (!coin) return 'hyperliquid';
  if (coin.startsWith('xyz:'))  return 'xyz';
  if (coin.startsWith('hyna:')) return 'hyena';
  if (coin.includes(':'))       return 'other_hip3';
  return 'hyperliquid';
}

export function filterByPlatform(fills, platform) {
  if (platform === 'all') return fills;
  return fills.filter(f => getPlatform(f.coin) === platform);
}

export function computeStats(fills) {
  return fills.reduce(
    (acc, fill) => {
      const notional = parseFloat(fill.px) * parseFloat(fill.sz);
      acc.volume += notional;
      acc.fees   += parseFloat(fill.fee || 0);
      acc.pnl    += parseFloat(fill.closedPnl || 0);
      acc.count  += 1;
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

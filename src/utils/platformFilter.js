// Les coins XYZ sont des équités/commodités sur HIP-3
// Exemple: "AAPL", "TSLA", "GOLD", etc.
const XYZ_COINS = ['AAPL', 'TSLA', 'NVDA', 'GOLD', 'SPX', /* ... */];

export function filterByPlatform(fills, platform) {
  switch (platform) {
    case 'xyz':
      // Filtre sur les coins HIP-3 XYZ (équités, matières premières)
      return fills.filter(f => XYZ_COINS.includes(f.coin));
    case 'hyena':
      // HyENA utilise un builder code dans les trades
      return fills.filter(f => f.builderFeeAddress === BUILDERS.hyena);
    case 'hyperliquid':
    default:
      return fills; // Tous les perps natifs HL
  }
}

export function computeVolume(fills) {
  return fills.reduce((acc, fill) => {
    const notional = parseFloat(fill.px) * parseFloat(fill.sz);
    return acc + notional;
  }, 0);
}


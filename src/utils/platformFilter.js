// Le champ `coin` dans les fills HIP-3 contient le nom complet du marché
// Exemples: "BTCHIP-3 Hyena", "NVDAHIP-3 XYZ", "GOLDHIP-3 Felix"
// Les perps natifs HL n'ont PAS "HIP-3" dans leur nom: "BTC", "ETH", "SOL"

/**
 * Détecte la plateforme d'un fill en lisant le champ `coin`
 */
export function getPlatform(coin) {
  if (!coin) return 'hyperliquid';
  const c = coin.toUpperCase();
  if (c.includes('HIP-3 XYZ'))        return 'xyz';
  if (c.includes('HIP-3 HYENA'))      return 'hyena';
  if (c.includes('HIP-3'))            return 'other_hip3'; // Felix, KM, Vantell, Cash...
  return 'hyperliquid';
}

/**
 * Filtre les fills selon la plateforme sélectionnée
 */
export function filterByPlatform(fills, platform) {
  switch (platform) {
    case 'xyz':
      return fills.filter(f => getPlatform(f.coin) === 'xyz');
    case 'hyena':
      return fills.filter(f => getPlatform(f.coin) === 'hyena');
    case 'hyperliquid':
      // Perps natifs uniquement, sans aucun HIP-3
      return fills.filter(f => getPlatform(f.coin) === 'hyperliquid');
    case 'all':
    default:
      return fills;
  }
}

/**
 * Calcule les statistiques d'un tableau de fills
 */
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

/**
 * Groupe le volume par jour pour le graphique
 */
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

const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

export default function VolumeStats({ stats }) {
  const cards = [
    { label: 'Volume total', value: `$${fmt(stats.volume)}` },
    { label: 'Nombre de trades', value: stats.count },
    { label: 'Fees payées', value: `$${fmt(stats.fees)}`, sub: 'USDC' },
    {
      label: 'PnL réalisé',
      value: `$${fmt(stats.pnl)}`,
      color: stats.pnl >= 0 ? 'text-green-400' : 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
      {cards.map(({ label, value, sub, color = 'text-white' }) => (
        <div key={label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs mb-1">{label}</p>
          <p className={`text-lg font-bold ${color}`}>{value}</p>
          {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

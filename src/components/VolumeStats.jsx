import { useMemo } from 'react';
import { computeVolume } from '../utils/platformFilter';

export default function VolumeStats({ fills, platform }) {
  const stats = useMemo(() => ({
    volume: computeVolume(fills),
    totalFees: fills.reduce((acc, f) => acc + parseFloat(f.fee || 0), 0),
    tradeCount: fills.length,
    pnl: fills.reduce((acc, f) => acc + parseFloat(f.closedPnl || 0), 0),
  }), [fills]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
      {[
        { label: 'Volume Total', value: `$${stats.volume.toLocaleString('fr-FR', {maximumFractionDigits: 2})}` },
        { label: 'Trades', value: stats.tradeCount },
        { label: 'Fees payées', value: `$${stats.totalFees.toFixed(2)}` },
        { label: 'PnL réalisé', value: `$${stats.pnl.toFixed(2)}`, color: stats.pnl >= 0 ? 'text-green-400' : 'text-red-400' },
      ].map(({ label, value, color = 'text-white' }) => (
        <div key={label} className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

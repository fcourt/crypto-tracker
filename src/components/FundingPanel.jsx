import { useEffect } from 'react';
import { useHyperliquidFunding, computeFundingStats } from '../hooks/useHyperliquidFunding';

const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 }).format(n);
const fmtUsd = (n) => {
  const val = parseFloat(n);
  return (val >= 0 ? '+' : '') + new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 }).format(val);
};

const PERIODS = [
  { label: '24h',    ms: 86400000 },
  { label: '7 jours', ms: 7 * 86400000 },
  { label: '30 jours', ms: 30 * 86400000 },
];

export default function FundingPanel({ address, startTime }) {
  const { funding, loading, error, fetchFunding } = useHyperliquidFunding();

  useEffect(() => {
    if (address) fetchFunding(address, startTime);
  }, [address, startTime, fetchFunding]);

  if (!address) return null;
  if (loading) return (
    <div className="mx-4 bg-gray-800 rounded-xl border border-gray-700 p-4">
      <p className="text-gray-500 text-sm">Chargement du funding...</p>
    </div>
  );
  if (error) return (
    <div className="mx-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
      {error}
    </div>
  );
  if (funding.length === 0) return (
    <div className="mx-4 bg-gray-800 rounded-xl border border-gray-700 p-4">
      <p className="text-gray-500 text-sm">Aucun funding sur cette période.</p>
    </div>
  );

  const stats = computeFundingStats(funding);

  return (
    <div className="mx-4 space-y-4">
      <h3 className="text-sm font-medium text-gray-400">
        Funding reçu / payé — {funding.length} versements
      </h3>

      {/* Total + top coins */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Total net */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 md:col-span-1">
          <p className="text-gray-400 text-xs mb-1">Total net (USDC)</p>
          <p className={`text-xl font-bold ${stats.totalUsdc >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtUsd(stats.totalUsdc)} $
          </p>
        </div>

        {/* Top 5 coins */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 md:col-span-2">
          <p className="text-gray-400 text-xs mb-2">Par coin</p>
          <div className="flex flex-wrap gap-2">
            {stats.topCoins.map(([coin, usdc]) => (
              <span
                key={coin}
                className={`text-xs px-3 py-1 rounded-full font-medium ${
                  usdc >= 0
                    ? 'bg-green-900/40 text-green-300 border border-green-700'
                    : 'bg-red-900/40 text-red-300 border border-red-700'
                }`}
              >
                {coin} : {fmtUsd(usdc)} $
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Heures de versement */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <p className="text-gray-400 text-xs mb-3">Heures de versement (UTC)</p>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
          {Array.from({ length: 24 }, (_, h) => {
            const data = stats.byHour[h];
            const hasData = !!data;
            const isPositive = data?.total >= 0;
            return (
              <div
                key={h}
                title={hasData ? `${h}h UTC — ${data.count} versements — ${fmtUsd(data.total)} $` : `${h}h UTC — aucun versement`}
                className={`rounded p-1 text-center text-xs cursor-default transition-colors ${
                  !hasData
                    ? 'bg-gray-700/30 text-gray-600'
                    : isPositive
                      ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                      : 'bg-red-900/50 text-red-300 border border-red-700/50'
                }`}
              >
                <div className="font-mono">{String(h).padStart(2, '0')}</div>
                {hasData && (
                  <div className="text-xs opacity-75">{data.count}x</div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-gray-600 text-xs mt-2">
          Le funding est versé toutes les heures sur Hyperliquid. Les cases vertes = funding reçu, rouges = funding payé.
        </p>
      </div>

      {/* Tableau des derniers versements */}
      <div className="rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400 text-xs">
            <tr>
              {['Date / Heure (UTC)', 'Coin', 'Montant (USDC)', 'Position', 'Samples'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {funding.slice(0, 100).map((f, i) => {
              const usdc = parseFloat(f.usdc || 0);
              const date = new Date(f.time);
              return (
                <tr key={i} className="hover:bg-gray-800/50">
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap font-mono text-xs">
                    {date.toISOString().replace('T', ' ').slice(0, 16)}
                  </td>
                  <td className="px-4 py-2 font-medium text-white">{f.coin}</td>
                  <td className={`px-4 py-2 font-medium ${usdc >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtUsd(usdc)} $
                  </td>
                  <td className="px-4 py-2 text-gray-300 text-xs">{fmt(f.szi)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{f.nSamples}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {funding.length > 100 && (
          <p className="text-center text-gray-500 text-xs py-2">
            Affichage limité à 100 / {funding.length} versements
          </p>
        )}
      </div>
    </div>
  );
}

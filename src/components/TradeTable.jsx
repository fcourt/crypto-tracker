const fmt = (n, dec = 2) => parseFloat(n).toLocaleString('fr-FR', { maximumFractionDigits: dec });

export default function TradeTable({ fills }) {
  if (fills.length === 0) return (
    <p className="text-center text-gray-500 py-8 text-sm">Aucun trade sur cette plateforme.</p>
  );

  return (
    <div className="mx-4 overflow-x-auto rounded-xl border border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 text-gray-400 text-xs">
          <tr>
            {['Date', 'Coin', 'Dir.', 'Prix', 'Taille', 'Notionnel', 'PnL', 'Fee'].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {fills.slice(0, 200).map(fill => {
            const notional = parseFloat(fill.px) * parseFloat(fill.sz);
            const pnl = parseFloat(fill.closedPnl || 0);
            return (
              <tr key={fill.tid} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                  {new Date(fill.time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-2 font-medium text-white">{fill.coin}</td>
                <td className={`px-4 py-2 font-medium ${fill.side === 'B' ? 'text-green-400' : 'text-red-400'}`}>
                  {fill.dir}
                </td>
                <td className="px-4 py-2 text-gray-300">${fmt(fill.px, 4)}</td>
                <td className="px-4 py-2 text-gray-300">{fmt(fill.sz, 4)}</td>
                <td className="px-4 py-2 text-white">${fmt(notional)}</td>
                <td className={`px-4 py-2 font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {pnl !== 0 ? `$${fmt(pnl)}` : '-'}
                </td>
                <td className="px-4 py-2 text-gray-400">${fmt(fill.fee, 4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fills.length > 200 && (
        <p className="text-center text-gray-500 text-xs py-2">
          Affichage limité à 200 / {fills.length} trades
        </p>
      )}
    </div>
  );
}

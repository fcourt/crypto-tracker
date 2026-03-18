const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const fmtSigned = (n) => (n >= 0 ? '+' : '') + fmt(n);

export default function PerpDexSummary({ cardsData }) {
  const hasData = cardsData.some(d => d !== null);
  if (!hasData) return null;

  const totals = cardsData.reduce((acc, cardData) => {
    if (!cardData) return acc;
    Object.values(cardData).forEach(d => {
      acc.pnl        += d.pnl;
      acc.fees       += d.fees;
      acc.fundingNet += d.fundingNet;
      acc.volume     += d.volume;
      acc.margin     += d.marginAvailable;
    });
    return acc;
  }, { pnl: 0, fees: 0, fundingNet: 0, volume: 0, margin: 0 });

  const netResult = totals.pnl - totals.fees + totals.fundingNet;

  return (
    <div className="bg-gray-800 rounded-xl border border-blue-700/50 p-5">
      <h3 className="text-sm font-bold text-white mb-4">
        📊 Synthèse globale — tous wallets · tous protocoles
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'PnL réalisé',
            value: `${fmtSigned(totals.pnl)} $`,
            color: totals.pnl >= 0 ? 'text-green-400' : 'text-red-400',
          },
          {
            label: 'Fees totales',
            value: `-${fmt(totals.fees)} $`,
            color: 'text-red-400',
          },
          {
            label: 'Funding net',
            value: `${fmtSigned(totals.fundingNet)} $`,
            color: totals.fundingNet >= 0 ? 'text-green-400' : 'text-red-400',
          },
          {
            label: 'Résultat net',
            value: `${fmtSigned(netResult)} $`,
            color: netResult >= 0 ? 'text-green-400' : 'text-red-400',
            highlight: true,
          },
          {
            label: 'Volume total',
            value: `${fmt(totals.volume)} $`,
            color: 'text-white',
          },
          {
            label: 'Margin dispo',
            value: `${fmt(totals.margin)} $`,
            color: 'text-blue-300',
          },
        ].map(({ label, value, color, highlight }) => (
          <div
            key={label}
            className={`rounded-xl p-3 border ${
              highlight
                ? 'bg-blue-900/30 border-blue-600'
                : 'bg-gray-900 border-gray-700'
            }`}
          >
            <p className="text-gray-400 text-xs mb-1">{label}</p>
            <p className={`text-base font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

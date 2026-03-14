import { useState } from 'react';
import { fetchDefiPositions } from '../hooks/useMegaDefi';

const PROTOCOL_COLORS = {
  Prism:   'bg-blue-900/40 text-blue-300 border-blue-700',
  Kumbaya: 'bg-green-900/40 text-green-300 border-green-700',
};

const TYPE_LABELS = {
  LP:     '💧 Liquidité',
  Supply: '🏦 Supply',
  Borrow: '📤 Borrow',
};

export default function DefiPositions({ address }) {
  const [positions, setPositions] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const load = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDefiPositions(address);
      setPositions(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const totalUsd = positions?.reduce((acc, p) => acc + (p.totalUsd || 0), 0) || 0;

  if (!address) return null;

  if (!positions && !loading) return (
    <div className="mx-4">
      <button
        onClick={load}
        className="bg-green-700 hover:bg-green-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
      >
        Charger les positions DeFi
      </button>
    </div>
  );

  if (loading) return (
    <p className="text-center text-gray-500 py-6 text-sm mx-4">
      Analyse des positions DeFi en cours...
    </p>
  );

  if (error) return (
    <div className="mx-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
      {error}
    </div>
  );

  return (
    <div className="mx-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">
          Positions DeFi — Prism · Kumbaya
        </h3>
        <span className="text-white font-bold text-sm">
          Total : ${totalUsd.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
        </span>
      </div>

      {positions.length === 0 ? (
        <p className="text-gray-600 text-sm py-4">
          Aucune position DeFi active détectée sur Prism ou Kumbaya.
        </p>
      ) : (
        positions.map((pos, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 ${PROTOCOL_COLORS[pos.protocol] || 'bg-gray-800 border-gray-700 text-gray-300'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{pos.protocol}</span>
                <span className="text-xs bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded-full">
                  {TYPE_LABELS[pos.type] || pos.type}
                </span>
                <span className="text-sm font-medium">{pos.name}</span>
              </div>
              <span className="font-bold text-white text-sm">
                ${pos.totalUsd.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex gap-4 text-xs text-gray-300 mt-1">
              <span>
                {pos.token0?.symbol} : {pos.token0?.amount?.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                {pos.token0?.usd > 0 && ` ($${pos.token0.usd.toFixed(2)})`}
              </span>
              {pos.token1 && (
                <span>
                  {pos.token1?.symbol} : {pos.token1?.amount?.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                  {pos.token1?.usd > 0 && ` ($${pos.token1.usd.toFixed(2)})`}
                </span>
              )}
              {pos.share && (
                <span className="text-gray-500">Part du pool : {pos.share}%</span>
              )}
            </div>
          </div>
        ))
      )}

      <div className="flex gap-3 pt-1">
        <a href={`https://prismfi.cc/portfolio`} target="_blank" rel="noreferrer"
          className="text-blue-400 hover:text-blue-300 text-xs underline">
          Voir sur Prism →
        </a>
        <a href={`https://www.kumbaya.xyz/#/`} target="_blank" rel="noreferrer"
          className="text-green-400 hover:text-green-300 text-xs underline">
          Voir sur Kumbaya →
        </a>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { fetchExtendedData, getExtendedApiKeys, saveExtendedApiKey } from '../hooks/useExtendedData';

const fmt  = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const fmtS = (n) => (n >= 0 ? '+' : '') + fmt(n);

function StatCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 px-3 py-2 flex flex-col gap-0.5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`font-bold text-base ${color}`}>{value}</span>
    </div>
  );
}

export default function ExtendedPanel() {
  const [apiKey, setApiKey]           = useState('');
  const [label, setLabel]             = useState('');
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [savedKeys, setSavedKeys]     = useState(getExtendedApiKeys());

  const handleLoad = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await fetchExtendedData(key);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim()) return;
    saveExtendedApiKey(apiKey.trim(), label);
    setSavedKeys(getExtendedApiKeys());
    setLabel('');
  };

  return (
    <div className="rounded-xl border border-cyan-700 bg-cyan-900/20 p-3">

      {/* En-tête */}
      <div className="flex items-center justify-between mb-3">
        <a
          href="https://app.extended.exchange/perp"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-bold text-white hover:underline"
        >
          Extended
        </a>
        <span className="text-xs text-gray-500">
          {data ? `${data.tradeCount} trades` : 'Clé API requise'}
        </span>
      </div>

      {/* Saisie clé API */}
      <div className="flex gap-2 items-center flex-wrap mb-2">
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
          placeholder="Clé API Extended..."
          className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
        />
        {savedKeys.length > 0 && (
          <select
            onChange={e => setApiKey(e.target.value)}
            defaultValue=""
            className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-300 focus:outline-none max-w-[130px]"
          >
            <option value="" disabled>Clés sauvegardées...</option>
            {savedKeys.map(k => (
              <option key={k.apiKey} value={k.apiKey}>{k.label}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Nom"
          className="w-16 bg-gray-900 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-400 focus:outline-none"
        />
        <button
          onClick={handleSave}
          className="bg-green-800 hover:bg-green-700 text-white text-xs px-2.5 py-2 rounded-lg"
        >
          💾
        </button>
        <button
          onClick={handleLoad}
          disabled={loading || !apiKey}
          className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded-lg"
        >
          {loading ? '...' : 'Charger'}
        </button>
      </div>

      <p className="text-gray-600 text-xs mb-3">
        🔒 La clé API Extended est en lecture seule — elle ne peut pas créer d'ordres.
        <a
          href="https://app.extended.exchange/perp"
          target="_blank"
          rel="noreferrer"
          className="ml-1 text-cyan-600 hover:text-cyan-400 underline"
        >
          Obtenir ma clé →
        </a>
      </p>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      {/* Résultats */}
      {data && (
        <div className="grid grid-cols-5 gap-2">
          <StatCard
            label="PnL réalisé"
            value={`${fmtS(data.pnl)} $`}
            color={data.pnl >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard
            label="Fees"
            value={`-${fmt(data.fees)} $`}
            color="text-red-400"
          />
          <StatCard
            label="PnL non réalisé"
            value={`${fmtS(data.unrealisedPnl)} $`}
            color={data.unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard
            label="Volume"
            value={`${fmt(data.volume)} $`}
            color="text-white"
          />
          <StatCard
            label={`Margin (${data.marginToken})`}
            value={`${fmt(data.marginAvailable)}`}
            color="text-cyan-300"
          />
        </div>
      )}
    </div>
  );
}

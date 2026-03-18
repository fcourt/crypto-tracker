import { useState } from 'react';
import { fetchPerpDexData, PROTOCOLS } from '../hooks/usePerpDexData';
import { getSavedWallets, saveWallet, removeWallet } from '../hooks/useWalletStorage';

const fmt    = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const fmtS   = (n) => (n >= 0 ? '+' : '') + fmt(n);

const COLOR_MAP = {
  blue:   'border-blue-700 bg-blue-900/20',
  purple: 'border-purple-700 bg-purple-900/20',
  orange: 'border-orange-700 bg-orange-900/20',
  cyan:   'border-cyan-700 bg-cyan-900/20',
  pink:   'border-pink-700 bg-pink-900/20',
  yellow: 'border-yellow-700 bg-yellow-900/20',
};

function StatRow({ label, value, color = 'text-white', large = false }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-700/50 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`font-bold ${large ? 'text-base' : 'text-sm'} ${color}`}>{value}</span>
    </div>
  );
}

export default function PerpDexCard({ cardIndex, onDataChange }) {
  const [inputAddress, setInputAddress] = useState('');
  const [selectedProtocols, setSelected] = useState(['hyperliquid', 'xyz', 'hyena']);
  const [data, setData]                  = useState(null);
  const [loading, setLoading]            = useState(false);
  const [error, setError]                = useState(null);
  const [savedWallets, setSavedWallets]  = useState(getSavedWallets());
  const [label, setLabel]                = useState('');

  const toggleProtocol = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleSearch = async () => {
    const addr = inputAddress.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await fetchPerpDexData(addr, selectedProtocols);
      setData(result);
      onDataChange?.(cardIndex, result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!inputAddress.trim()) return;
    saveWallet(inputAddress.trim(), label);
    setSavedWallets(getSavedWallets());
    setLabel('');
  };

  const totals = data
    ? Object.values(data).reduce((acc, d) => ({
        pnl:        acc.pnl + d.pnl,
        fees:       acc.fees + d.fees,
        fundingNet: acc.fundingNet + d.fundingNet,
        volume:     acc.volume + d.volume,
      }), { pnl: 0, fees: 0, fundingNet: 0, volume: 0 })
    : null;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-4">

      {/* Titre */}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        Wallet #{cardIndex + 1}
      </p>

      {/* Saisie adresse */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputAddress}
            onChange={e => setInputAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="0x..."
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !inputAddress}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? '...' : 'Charger'}
          </button>
        </div>

        {/* Wallets sauvegardés */}
        {savedWallets.length > 0 && (
          <select
            onChange={e => setInputAddress(e.target.value)}
            defaultValue=""
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
          >
            <option value="" disabled>Wallets sauvegardés...</option>
            {savedWallets.map(w => (
              <option key={w.address} value={w.address}>
                {w.label} — {w.address.slice(0, 8)}...
              </option>
            ))}
          </select>
        )}

        {/* Sauvegarde wallet */}
        {inputAddress && (
          <div className="flex gap-2">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nom du wallet (optionnel)"
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-500 placeholder-gray-600 focus:outline-none focus:border-green-500"
            />
            <button
              onClick={handleSave}
              title="Sauvegarder ce wallet"
              className="bg-green-800 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg"
            >
              💾
            </button>
          </div>
        )}
      </div>

      {/* Sélection protocoles */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Protocoles</p>
        <div className="flex flex-wrap gap-1.5">
          {PROTOCOLS.map(p => (
            <button
              key={p.id}
              onClick={() => toggleProtocol(p.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedProtocols.includes(p.id)
                  ? COLOR_MAP[p.color] + ' text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-500'
              }`}
            >
              {p.label}
              {!['hyperliquid', 'xyz', 'hyena'].includes(p.id) && (
                <span className="ml-1 opacity-50">⚠️</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-1">⚠️ API non encore disponible</p>
      </div>

      {/* Erreur */}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Résultats par protocole */}
      {data && (
        <div className="space-y-3">
          {Object.entries(data).map(([protocolId, d]) => {
            const proto = PROTOCOLS.find(p => p.id === protocolId);
            return (
              <div
                key={protocolId}
                className={`rounded-xl border p-4 ${COLOR_MAP[proto?.color] || 'bg-gray-900 border-gray-700'}`}
              >
                {/* En-tête protocole */}
                <div className="flex items-center justify-between mb-3">
                  <a
                    href={proto?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold text-white hover:underline"
                  >
                    {proto?.label}
                  </a>
                  <span className="text-xs text-gray-500">{d.tradeCount} trades</span>
                </div>

                {d.available ? (
                  <div className="space-y-0.5">
                    <StatRow
                      label="PnL réalisé"
                      value={`${fmtS(d.pnl)} $`}
                      color={d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}
                      large
                    />
                    <StatRow
                      label="Fees payées"
                      value={`-${fmt(d.fees)} $`}
                      color="text-red-400"
                      large
                    />
                    <StatRow
                      label="Funding net (30j)"
                      value={`${fmtS(d.fundingNet)} $`}
                      color={d.fundingNet >= 0 ? 'text-green-400' : 'text-red-400'}
                      large
                    />
                    <StatRow
                      label="Volume"
                      value={`${fmt(d.volume)} $`}
                      color="text-white"
                    />
                    <StatRow
                      label={`Margin dispo (${d.marginToken})`}
                      value={`${fmt(d.marginAvailable)} ${d.marginToken}`}
                      color="text-blue-300"
                    />
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">API publique non disponible.</p>
                )}
              </div>
            );
          })}

          {/* Sous-total de la carte */}
          {totals && (
            <div className="bg-gray-900 rounded-xl border border-gray-600 p-4 mt-1">
              <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                Sous-total wallet #{cardIndex + 1}
              </p>
              <div className="space-y-0.5">
                <StatRow label="PnL net"      value={`${fmtS(totals.pnl)} $`}      color={totals.pnl >= 0 ? 'text-green-400' : 'text-red-400'} large />
                <StatRow label="Fees totales" value={`-${fmt(totals.fees)} $`}      color="text-red-400" large />
                <StatRow label="Funding net"  value={`${fmtS(totals.fundingNet)} $`} color={totals.fundingNet >= 0 ? 'text-green-400' : 'text-red-400'} large />
                <StatRow label="Volume total" value={`${fmt(totals.volume)} $`}     color="text-white" large />
                <StatRow
                  label="Résultat net (PnL - fees + funding)"
                  value={`${fmtS(totals.pnl - totals.fees + totals.fundingNet)} $`}
                  color={(totals.pnl - totals.fees + totals.fundingNet) >= 0 ? 'text-green-300' : 'text-red-300'}
                  large
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

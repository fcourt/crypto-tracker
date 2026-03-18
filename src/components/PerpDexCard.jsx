import { useState, useEffect } from 'react';
import { fetchPerpDexData, PROTOCOLS } from '../hooks/usePerpDexData';
import { getSavedWallets, saveWallet, removeWallet } from '../hooks/useWalletStorage';

const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const fmtSigned = (n) => (n >= 0 ? '+' : '') + fmt(n);

const COLOR_MAP = {
  blue:   'border-blue-700 bg-blue-900/20',
  purple: 'border-purple-700 bg-purple-900/20',
  orange: 'border-orange-700 bg-orange-900/20',
  cyan:   'border-cyan-700 bg-cyan-900/20',
  pink:   'border-pink-700 bg-pink-900/20',
  yellow: 'border-yellow-700 bg-yellow-900/20',
};

export default function PerpDexCard({ cardIndex, onDataChange }) {
  const [address, setAddress]             = useState('');
  const [inputAddress, setInputAddress]   = useState('');
  const [selectedProtocols, setSelected]  = useState(['hyperliquid', 'xyz', 'hyena']);
  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [savedWallets, setSavedWallets]   = useState(getSavedWallets());
  const [label, setLabel]                 = useState('');

  const toggleProtocol = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSearch = async () => {
    const addr = inputAddress.trim();
    if (!addr) return;
    setAddress(addr);
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
  };

  const handleRemove = (addr) => {
    removeWallet(addr);
    setSavedWallets(getSavedWallets());
  };

  const handleSelectSaved = (addr) => {
    setInputAddress(addr);
  };

  // Totaux de cette carte
  const totals = data ? Object.values(data).reduce((acc, d) => ({
    pnl:             acc.pnl + d.pnl,
    fees:            acc.fees + d.fees,
    fundingNet:      acc.fundingNet + d.fundingNet,
    marginAvailable: Math.max(acc.marginAvailable, d.marginAvailable),
    volume:          acc.volume + d.volume,
  }), { pnl: 0, fees: 0, fundingNet: 0, marginAvailable: 0, volume: 0 }) : null;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-4">

      {/* Titre de la carte */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Wallet #{cardIndex + 1}
        </span>
      </div>

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
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {loading ? '...' : 'OK'}
          </button>
        </div>

        {/* Wallets sauvegardés */}
        {savedWallets.length > 0 && (
          <select
            onChange={e => handleSelectSaved(e.target.value)}
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

        {/* Sauvegarde */}
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
              className="bg-green-800 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
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
                  ? COLOR_MAP[p.color] + ' text-white border-opacity-100'
                  : 'bg-gray-900 border-gray-700 text-gray-500'
              }`}
            >
              {p.label}
              {(!['hyperliquid','xyz','hyena'].includes(p.id)) && (
                <span className="ml-1 text-gray-600 text-xs">⚠️</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-1">⚠️ API non disponible</p>
      </div>

      {/* Erreur */}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Résultats par protocole */}
      {data && (
        <div className="space-y-2">
          {Object.entries(data).map(([protocolId, d]) => {
            const proto = PROTOCOLS.find(p => p.id === protocolId);
            return (
              <div
                key={protocolId}
                className={`rounded-lg border p-3 ${COLOR_MAP[proto?.color] || 'bg-gray-900 border-gray-700'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <a
                    href={proto?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-white hover:underline"
                  >
                    {proto?.label}
                  </a>
                  {!d.available && (
                    <span className="text-xs text-gray-500">API indisponible</span>
                  )}
                </div>
                {d.available ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-gray-500">PnL réalisé</span>
                      <span className={`ml-2 font-medium ${d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtSigned(d.pnl)} $
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Fees</span>
                      <span className="ml-2 text-red-400 font-medium">-{fmt(d.fees)} $</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Funding net</span>
                      <span className={`ml-2 font-medium ${d.fundingNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtSigned(d.fundingNet)} $
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Volume</span>
                      <span className="ml-2 text-white font-medium">{fmt(d.volume)} $</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">Margin dispo</span>
                      <span className="ml-2 text-blue-300 font-medium">{fmt(d.marginAvailable)} $</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">Données non disponibles via API publique.</p>
                )}
              </div>
            );
          })}

          {/* Mini synthèse de la carte */}
          {totals && (
            <div className="bg-gray-900 rounded-lg border border-gray-600 p-3 mt-2">
              <p className="text-xs text-gray-400 font-bold mb-2">Sous-total wallet #{cardIndex + 1}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-gray-500">PnL net</span>
                  <span className={`ml-2 font-bold ${totals.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtSigned(totals.pnl)} $
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Fees totales</span>
                  <span className="ml-2 text-red-400 font-bold">-{fmt(totals.fees)} $</span>
                </div>
                <div>
                  <span className="text-gray-500">Funding net</span>
                  <span className={`ml-2 font-bold ${totals.fundingNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtSigned(totals.fundingNet)} $
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Volume total</span>
                  <span className="ml-2 text-white font-bold">{fmt(totals.volume)} $</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPerpDexDataWithSubs, PROTOCOLS } from '../hooks/usePerpDexData';
import { fetchExtendedData } from '../hooks/useExtendedData';
import { getSavedWallets, saveWallet } from '../hooks/useWalletStorage';

const fmt  = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const fmtS = (n) => (n >= 0 ? '+' : '') + fmt(n);

const COLOR_MAP = {
  blue:   'border-blue-700 bg-blue-900/20',
  purple: 'border-purple-700 bg-purple-900/20',
  orange: 'border-orange-700 bg-orange-900/20',
  cyan:   'border-cyan-700 bg-cyan-900/20',
  pink:   'border-pink-700 bg-pink-900/20',
  yellow: 'border-yellow-700 bg-yellow-900/20',
};

function StatCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 px-3 py-2 flex flex-col gap-0.5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`font-bold text-base ${color}`}>{value}</span>
    </div>
  );
}

function ProtocolStats({ protocolId, d }) {
  const proto = PROTOCOLS.find(p => p.id === protocolId);
  return (
    <div className={`rounded-xl border p-3 ${COLOR_MAP[proto?.color] || 'bg-gray-900 border-gray-700'}`}>
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
        <div className="grid grid-cols-5 gap-2">
          <StatCard label="PnL réalisé"  value={`${fmtS(d.pnl)} $`}       color={d.pnl >= 0 ? 'text-green-400' : 'text-red-400'} />
          <StatCard label="Fees"         value={`-${fmt(d.fees)} $`}       color="text-red-400" />
          <StatCard label="Funding net"  value={`${fmtS(d.fundingNet)} $`} color={d.fundingNet >= 0 ? 'text-green-400' : 'text-red-400'} />
          <StatCard label="Volume"       value={`${fmt(d.volume)} $`}      color="text-white" />
          <StatCard label={`Margin (${d.marginToken})`} value={`${fmt(d.marginAvailable)}`} color="text-blue-300" />
        </div>
      ) : (
        <p className="text-gray-600 text-xs">
          {protocolId === 'variational' && 'Protocole OTC/RFQ — pas de données publiques'}
          {protocolId === 'legend'      && 'Données non accessibles via API publique'}
          {protocolId === 'extended'    && 'Sélectionnez Extended seul pour saisir votre clé API'}
        </p>
      )}
    </div>
  );
}

function WalletSection({ label, address, data }) {
  const isHex = address.startsWith('0x');
  const displayAddr = isHex
    ? `${address.slice(0, 8)}...${address.slice(-4)}`
    : address;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
          {label} — {displayAddr}
        </span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>
      {Object.entries(data).map(([protocolId, d]) => (
        <ProtocolStats key={protocolId} protocolId={protocolId} d={d} />
      ))}
    </div>
  );
}

const WALLET_PROTOCOLS = ['hyperliquid', 'xyz', 'hyena', 'variational', 'legend'];

export default function PerpDexCard({ cardIndex, onDataChange, dateRange }) {
  const [inputValue, setInputValue]          = useState('');
  const [selectedProtocols, setSelected]     = useState(['hyperliquid', 'xyz', 'hyena']);
  const [includeSubAccounts, setIncludeSubs] = useState(false);
  const [result, setResult]                  = useState(null);
  const [loading, setLoading]                = useState(false);
  const [error, setError]                    = useState(null);
  const [savedWallets, setSavedWallets]      = useState(getSavedWallets());
  const [label, setLabel]                    = useState('');

  const hasLoaded     = useRef(false);
  const prevDateRange = useRef(null);

  const onlyExtended = selectedProtocols.length === 1
                    && selectedProtocols[0] === 'extended';

  const toggleProtocol = (id) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );

  const handleSearch = useCallback(async () => {
    const val = inputValue.trim();
    if (!val) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let data;
      if (onlyExtended) {
        const extData = await fetchExtendedData(val);
        data = { main: { extended: extData }, subAccounts: [] };
      } else {
        const walletProtos = selectedProtocols.filter(p =>
          WALLET_PROTOCOLS.includes(p)
        );
        data = await fetchPerpDexDataWithSubs(
          val, walletProtos, includeSubAccounts, dateRange
        );
      }

      setResult(data);
      onDataChange?.(cardIndex, data.main);
      hasLoaded.current = true;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [inputValue, selectedProtocols, includeSubAccounts, dateRange, onlyExtended, cardIndex, onDataChange]);

  useEffect(() => {
    if (prevDateRange.current === null) {
      prevDateRange.current = dateRange;
      return;
    }
    const fromChanged = prevDateRange.current?.from?.getTime() !== dateRange?.from?.getTime();
    const toChanged   = prevDateRange.current?.to?.getTime()   !== dateRange?.to?.getTime();
    if (fromChanged || toChanged) {
      prevDateRange.current = dateRange;
      if (hasLoaded.current && inputValue.trim() && !onlyExtended) {
        handleSearch();
      }
    }
  }, [dateRange, handleSearch, inputValue, onlyExtended]);

  const handleSave = () => {
    if (!inputValue.trim() || onlyExtended) return;
    saveWallet(inputValue.trim(), label);
    setSavedWallets(getSavedWallets());
    setLabel('');
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-3">

      {/* Titre */}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
        Wallet #{cardIndex + 1}
      </p>

      {/* Saisie */}
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type={onlyExtended ? 'password' : 'text'}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={onlyExtended ? 'Clé API Extended...' : '0x...'}
          className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        {!onlyExtended && savedWallets.length > 0 && (
          <select
            onChange={e => setInputValue(e.target.value)}
            defaultValue=""
            className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-300 focus:outline-none max-w-[140px]"
          >
            <option value="" disabled>Sauvegardés...</option>
            {savedWallets.map(w => (
              <option key={w.address} value={w.address}>{w.label}</option>
            ))}
          </select>
        )}
        {!onlyExtended && (
          <>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nom"
              className="w-20 bg-gray-900 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-400 placeholder-gray-600 focus:outline-none focus:border-green-500"
            />
            <button
              onClick={handleSave}
              title="Sauvegarder ce wallet"
              className="bg-green-800 hover:bg-green-700 text-white text-xs px-2.5 py-2 rounded-lg"
            >
              💾
            </button>
          </>
        )}
        <button
          onClick={handleSearch}
          disabled={loading || !inputValue}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? '...' : 'Charger'}
        </button>
      </div>

      {/* Hint mode clé API */}
      {onlyExtended && (
        <p className="text-gray-600 text-xs -mt-1">
          🔒 Clé API en lecture seule — aucun accès aux fonds.
        </p>
      )}

      {/* Protocoles + sub-accounts */}
      <div className="flex flex-wrap gap-1.5 items-center justify-between">
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
              {!['hyperliquid', 'xyz', 'hyena', 'extended'].includes(p.id) && (
                <span className="ml-1 opacity-40 text-xs">⚠️</span>
              )}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0 ml-2">
          <input
            type="checkbox"
            checked={includeSubAccounts}
            onChange={e => setIncludeSubs(e.target.checked)}
            className="accent-blue-500 w-3.5 h-3.5"
          />
          <span className="text-xs text-gray-400">Sub-accounts</span>
        </label>
      </div>

      {/* Erreur */}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Compte principal */}
      {result?.main && (
        <WalletSection
          label={result.subAccounts.length > 0 ? 'Compte principal' : 'Wallet'}
          address={onlyExtended ? '🔑 Extended' : inputValue.trim()}
          data={result.main}
        />
      )}

      {/* Sub-accounts */}
      {result?.subAccounts?.length > 0 && result.subAccounts.map((sub) => (
        <div key={sub.address}>
          {sub.error ? (
            <p className="text-red-400 text-xs px-2">
              Erreur sub-account {sub.name} : {sub.error}
            </p>
          ) : sub.data ? (
            <WalletSection
              label={sub.name || 'Sub-account'}
              address={sub.address}
              data={sub.data}
            />
          ) : null}
        </div>
      ))}

      {/* Aucun sub-account */}
      {result && includeSubAccounts && result.subAccounts.length === 0 && !onlyExtended && (
        <p className="text-gray-600 text-xs text-center py-1">
          Aucun sub-account trouvé pour ce wallet.
        </p>
      )}

    </div>
  );
}

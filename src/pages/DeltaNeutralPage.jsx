import { useState, useEffect, useMemo } from 'react';
import { useLivePrices, MARKETS, PLATFORMS } from '../hooks/useLivePrices';
import { useFundingRates } from '../hooks/useFundingRates';
import { getExtendedApiKeys, saveExtendedApiKey } from '../hooks/useExtendedData';
import { usePlaceOrder } from '../hooks/usePlaceOrder';
import { useHLMeta } from '../hooks/useHLMeta';

// ─── Constants ───────────────────────────────────────────────────────────────

const HL_API = 'https://api.hyperliquid.xyz/info';
const LEVERAGE_STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 50];
const DEFAULT_FEES = {
  hyperliquid: { maker: 0.0001,  taker: 0.00035 },
  xyz:         { maker: 0.00003, taker: 0.00009 },
  hyena:       { maker: 0.0002,  taker: 0.0005  },
  extended:    { maker: 0.0002,  taker: 0.0005  },
};
const FEES_STORAGE_KEY = 'dn_platform_fees';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt    = (n, d = 2) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n);
const fmtUSD = (n) => n == null ? '—' : '$' + fmt(n, 2);
const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(4) + '%';

function minLeverageFor(notional, margin) {
  if (!margin || margin <= 0 || !notional) return null;
  const raw = notional / margin;
  return LEVERAGE_STEPS.find(l => l >= raw) ?? LEVERAGE_STEPS[LEVERAGE_STEPS.length - 1];
}

function loadFees() {
  try { return { ...DEFAULT_FEES, ...JSON.parse(localStorage.getItem(FEES_STORAGE_KEY) || '{}') }; }
  catch { return DEFAULT_FEES; }
}

function saveFees(fees) {
  localStorage.setItem(FEES_STORAGE_KEY, JSON.stringify(fees));
}

// ─── Fetchers positions ───────────────────────────────────────────────────────

async function fetchHLPositions(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return [];
  try {
    const res   = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
    });
    const state = await res.json();
    return (state?.assetPositions || [])
      .filter(p => parseFloat(p.position?.szi) !== 0)
      .map(p => {
        const coin     = p.position.coin;
        const szi      = parseFloat(p.position.szi);
        const platform = coin.startsWith('xyz:')  ? 'xyz'
                       : coin.startsWith('hyna:') ? 'hyena'
                       : 'hyperliquid';
        const market   = MARKETS.find(m => m.hlKey === coin);
        return {
          platform,
          coin,
          marketId:      market?.id ?? null,
          label:         market?.label ?? coin,
          side:          szi > 0 ? 'LONG' : 'SHORT',
          szi:           Math.abs(szi),
          entryPx:       parseFloat(p.position.entryPx || 0),
          unrealizedPnl: parseFloat(p.position.unrealizedPnl || 0),
        };
      });
  } catch (e) {
    console.warn('fetchHLPositions error:', e.message);
    return [];
  }
}

async function fetchExtPositions(apiKey) {
  if (!apiKey?.trim()) return [];
  try {
    const res  = await fetch(
      `/api/extended?endpoint=${encodeURIComponent('/user/positions')}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    const data = await res.json();
    return (data?.data || []).map(p => {
      const market = MARKETS.find(m => m.extKey === p.market);
      return {
        platform:      'extended',
        coin:          p.market,
        marketId:      market?.id ?? null,
        label:         market?.label ?? p.market,
        side:          p.side,
        szi:           parseFloat(p.size),
        entryPx:       parseFloat(p.openPrice),
        unrealizedPnl: parseFloat(p.unrealisedPnl ?? 0),
      };
    });
  } catch (e) {
    console.warn('fetchExtPositions error:', e.message);
    return [];
  }
}

// ─── Hooks locaux ─────────────────────────────────────────────────────────────

function useHLMargin(address) {
  const [margin, setMargin] = useState(null);
  useEffect(() => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    const fetch_ = async () => {
      try {
        const res   = await fetch(HL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: address }),
        });
        const state = await res.json();
        const accountValue    = parseFloat(state?.crossMarginSummary?.accountValue    || 0);
        const totalMarginUsed = parseFloat(state?.crossMarginSummary?.totalMarginUsed || 0);
        setMargin(accountValue - totalMarginUsed);
      } catch { setMargin(null); }
    };
    fetch_();
    const t = setInterval(fetch_, 15000);
    return () => clearInterval(t);
  }, [address]);
  return margin;
}

function useExtMargin(apiKey) {
  const [margin, setMargin] = useState(null);
  useEffect(() => {
    if (!apiKey?.trim()) return;
    const fetch_ = async () => {
      try {
        const res  = await fetch(
          `/api/extended?endpoint=${encodeURIComponent('/user/balance')}`,
          { headers: { 'X-Api-Key': apiKey } }
        );
        const data = await res.json();
        setMargin(parseFloat(data?.data?.availableForTrade || 0));
      } catch { setMargin(null); }
    };
    fetch_();
    const t = setInterval(fetch_, 15000);
    return () => clearInterval(t);
  }, [apiKey]);
  return margin;
}

function useOrderBook(hlKey) {
  const [book, setBook] = useState({ bid: null, ask: null });
  useEffect(() => {
    if (!hlKey) return;
    const fetch_ = async () => {
      try {
        const res  = await fetch(HL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'l2Book', coin: hlKey }),
        });
        const data = await res.json();
        const bid  = parseFloat(data?.levels?.[0]?.[0]?.px);
        const ask  = parseFloat(data?.levels?.[1]?.[0]?.px);
        setBook({ bid: isNaN(bid) ? null : bid, ask: isNaN(ask) ? null : ask });
      } catch { setBook({ bid: null, ask: null }); }
    };
    fetch_();
    const t = setInterval(fetch_, 5000);
    return () => clearInterval(t);
  }, [hlKey]);
  return book;
}

function useOpenPositions(address, extApiKey) {
  const [positions, setPositions] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [hlPos, extPos] = await Promise.all([
        fetchHLPositions(address),
        fetchExtPositions(extApiKey),
      ]);
      setPositions([...hlPos, ...extPos]);
    } catch (e) {
      console.warn('useOpenPositions error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  return { positions, loading, load };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PriceDot({ fresh }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${fresh ? 'bg-green-400' : 'bg-yellow-500'}`} />
  );
}

function WalletConfigPanel({ hlAddress, onHlChange, extApiKey, onExtChange }) {
  const [open, setOpen] = useState(!hlAddress && !extApiKey);

  // Nouveaux états pour les clés de trading
  const [hlAgentPk,      setHlAgentPk]      = useState(() => localStorage.getItem('hl_agent_pk')     || '');
  const [hlVaultAddress, setHlVaultAddress]  = useState(() => localStorage.getItem('hl_vault_address') || '');
  const [extStarkPk,     setExtStarkPk]      = useState(() => localStorage.getItem('ext_stark_pk')    || '');
  const [extL2Vault,     setExtL2Vault]      = useState(() => localStorage.getItem('ext_l2_vault')    || '');

  const saveHlAgentPk      = v => { setHlAgentPk(v);      localStorage.setItem('hl_agent_pk',      v); };
  const saveHlVaultAddress = v => { setHlVaultAddress(v); localStorage.setItem('hl_vault_address', v); };
  const saveExtStarkPk     = v => { setExtStarkPk(v);     localStorage.setItem('ext_stark_pk',     v); };
  const saveExtL2Vault     = v => { setExtL2Vault(v);     localStorage.setItem('ext_l2_vault',     v); };

  const canTradeHL  = !!hlAgentPk;
  const canTradeExt = !!extStarkPk && !!extL2Vault;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-medium flex items-center gap-2 flex-wrap">
          🔑 Wallets & API Keys
          {hlAddress
            ? <span className="text-green-400">● HL connecté</span>
            : <span className="text-red-400">● HL non configuré</span>}
          {canTradeHL
            ? <span className="text-green-400">● HL trading ✓</span>
            : <span className="text-yellow-500">● HL trading non configuré</span>}
          {extApiKey
            ? <span className="text-green-400">● Extended connecté</span>
            : <span className="text-yellow-500">● Extended non configuré</span>}
          {canTradeExt
            ? <span className="text-green-400">● Extended trading ✓</span>
            : <span className="text-yellow-500">● Extended trading non configuré</span>}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-5">

          {/* ── Hyperliquid ── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-blue-400 border-b border-gray-700 pb-1">
              Hyperliquid / trade.xyz / HyENA
            </p>

            {/* Adresse principale */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Adresse du compte principal</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hlAddress}
                  onChange={e => onHlChange(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {hlAddress && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
              </div>
              <p className="text-gray-600 text-xs">Lecture des positions et marge disponible</p>
            </div>

            {/* Clé privée agent */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Clé privée Agent Wallet
                <span className="ml-2 text-gray-600">(HL › More › API › Generate)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={hlAgentPk}
                  onChange={e => saveHlAgentPk(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {hlAgentPk && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
              </div>
              <p className="text-gray-600 text-xs">⚠️ Copiée une seule fois à la création — ne peut que trader, pas retirer</p>
            </div>

            {/* Sous-compte optionnel */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Adresse sous-compte dédié
                <span className="ml-2 text-gray-600">(optionnel — HL › Portfolio › Sub-accounts)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hlVaultAddress}
                  onChange={e => saveHlVaultAddress(e.target.value)}
                  placeholder="0x... (laisser vide pour compte principal)"
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {hlVaultAddress && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
              </div>
            </div>
          </div>

          {/* ── Extended ── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-purple-400 border-b border-gray-700 pb-1">
              Extended Exchange
            </p>

            {/* Clé API lecture */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Clé API (lecture)</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={extApiKey}
                  onChange={e => onExtChange(e.target.value)}
                  placeholder="Votre clé API..."
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {extApiKey && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
              </div>
              <p className="text-gray-600 text-xs">Marge disponible, positions, funding rates</p>
            </div>

            {/* Stark Private Key */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Stark Private Key
                <span className="ml-2 text-gray-600">(Extended › Account › API Management)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={extStarkPk}
                  onChange={e => saveExtStarkPk(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {extStarkPk && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
              </div>
              <p className="text-gray-600 text-xs">⚠️ Copiée une seule fois à la création — ne peut que trader, pas retirer</p>
            </div>

            {/* l2Vault */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                l2Vault (ID sous-compte)
                <span className="ml-2 text-gray-600">(Extended › Account › API Management)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={extL2Vault}
                  onChange={e => saveExtL2Vault(e.target.value)}
                  placeholder="ex: 123456"
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {extL2Vault && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function FeeConfigPanel({ fees, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-medium">⚙️ Taux de fees par plateforme</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(fees).map(([pid, f]) => {
            const plat = PLATFORMS.find(p => p.id === pid);
            return (
              <div key={pid} className="flex flex-col gap-1">
                <p className="text-xs font-bold text-gray-300">{plat?.label ?? pid}</p>
                <label className="text-xs text-gray-500">Maker (%)</label>
                <input
                  type="number" step="0.001" min="0"
                  value={(f.maker * 100).toFixed(3)}
                  onChange={e => onChange(pid, 'maker', parseFloat(e.target.value) / 100)}
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <label className="text-xs text-gray-500">Taker (%)</label>
                <input
                  type="number" step="0.001" min="0"
                  value={(f.taker * 100).toFixed(3)}
                  onChange={e => onChange(pid, 'taker', parseFloat(e.target.value) / 100)}
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PositionLoader({ address, extApiKey, onLoad, getPrice }) {
  const { positions, loading, load } = useOpenPositions(address, extApiKey);
  const [selected, setSelected] = useState('');

  const handleSelect = (e) => {
    const val = e.target.value;
    setSelected(val);
    if (!val) return;
    const pos          = positions.find((_, i) => String(i) === val);
    if (!pos) return;
    const currentPrice = getPrice(pos.marketId, pos.platform);
    const sizeUSD      = currentPrice
      ? (pos.szi * currentPrice).toFixed(2)
      : (pos.szi * pos.entryPx).toFixed(2);
    onLoad({ ...pos, sizeUSD });
    setSelected('');
  };

  if (!address) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={load}
        disabled={loading}
        className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors shrink-0"
      >
        <span className={loading ? 'animate-spin inline-block' : ''}>
          {loading ? '⟳' : '📂'}
        </span>
        Charger mes positions
      </button>

      {positions.length > 0 && (
        <select
          value={selected}
          onChange={handleSelect}
          className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Sélectionner une position...</option>
          {positions.map((p, i) => (
            <option key={i} value={String(i)}>
              {p.side} {p.szi} {p.label} @ ${fmt(p.entryPx, 2)} —{' '}
              {PLATFORMS.find(pl => pl.id === p.platform)?.label ?? p.platform}
              {p.unrealizedPnl != null && (
                `${p.unrealizedPnl >= 0 ? ' 📈 +' : ' 📉 '}$${fmt(p.unrealizedPnl, 2)}`
              )}
            </option>
          ))}
        </select>
      )}

      {positions.length === 0 && !loading && (
        <span className="text-xs text-gray-500 italic">
          Cliquez pour charger les positions ouvertes (HL + Extended)
        </span>
      )}
    </div>
  );
}

function LegCard({
  side, platform, price, limitPrice, leverage,
  sizeUSD, sizeAsset, marginAvailable,
  fundingRate, isSuggested, feesMaker, feesTaker,
  useStepSize, stepSize,
  onPlaceOrder, isPlacingOrder, canTrade,
}) {
  const isLong     = side === 'LONG';
  const fundingNet = fundingRate != null ? (isLong ? -fundingRate : fundingRate) : null;
  const receivePay = fundingNet == null ? null : fundingNet >= 0 ? 'reçoit' : 'paie';

  const sizeDisplay = useStepSize && stepSize && sizeAsset
    ? Math.floor(sizeAsset / stepSize) * stepSize
    : sizeAsset;

  const feeMaker = sizeUSD != null ? sizeUSD * feesMaker : null;
  const feeTaker = sizeUSD != null ? sizeUSD * feesTaker : null;

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
      isLong ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isLong ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
          }`}>
            {side}
          </span>
          <span className="text-sm font-bold text-white">{platform?.label}</span>
        </div>
        {isSuggested && <span className="text-xs text-yellow-400 font-medium">⭐ Optimal</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs mb-0.5">Prix market</p>
          <p className="text-white font-bold">{price ? fmtUSD(price) : '—'}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs mb-0.5">Limit maker suggéré</p>
          <p className="text-blue-300 font-bold">{limitPrice ? fmtUSD(limitPrice) : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Notionnel USD</p>
          <p className="text-white font-bold">{fmtUSD(sizeUSD)}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">
            Size (asset){useStepSize && <span className="text-blue-400 ml-1">step</span>}
          </p>
          <p className="text-white font-bold">{sizeDisplay ? fmt(sizeDisplay, 6) : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Levier min. requis</p>
          <p className="text-blue-300 font-bold text-lg">
            {leverage != null ? `${leverage}x` : '—'}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Marge disponible</p>
          <p className={`font-bold ${
            marginAvailable == null ? 'text-gray-500'
            : marginAvailable > 0   ? 'text-green-300'
            : 'text-red-400'
          }`}>
            {marginAvailable != null ? fmtUSD(marginAvailable) : '—'}
          </p>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg px-3 py-2">
        <p className="text-gray-500 text-xs mb-1">Funding rate (1h)</p>
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div>
            <span className={`font-bold text-sm ${
              fundingRate == null ? 'text-gray-500'
              : fundingRate >= 0  ? 'text-orange-400'
              : 'text-green-400'
            }`}>
              {fmtPct(fundingRate)}
            </span>
            <span className="text-gray-500 text-xs ml-1">
              ({fmtPct(fundingRate != null ? fundingRate * 24 * 365 : null)} /an)
            </span>
          </div>
          {fundingNet != null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              fundingNet >= 0 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
            }`}>
              {side} {receivePay} le funding
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Fees maker</p>
          <p className="text-yellow-300 font-bold">{feeMaker != null ? fmtUSD(feeMaker) : '—'}</p>
          <p className="text-gray-600 text-xs">{(feesMaker * 100).toFixed(3)}%</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Fees taker</p>
          <p className="text-yellow-300 font-bold">{feeTaker != null ? fmtUSD(feeTaker) : '—'}</p>
          <p className="text-gray-600 text-xs">{(feesTaker * 100).toFixed(3)}%</p>
        </div>
      </div>

      {/* ── Boutons action (remplacer l'ancien bouton "Copier la size") ── */}
      {sizeDisplay && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(sizeDisplay.toFixed(6))}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
          >
            📋 Copier la size : {fmt(sizeDisplay, 6)}
          </button>

          {canTrade ? (
            <button
              onClick={onPlaceOrder}
              disabled={isPlacingOrder || !limitPrice || !sizeDisplay}
              className={`w-full text-white text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
                isLong
                  ? 'bg-green-700 hover:bg-green-600 disabled:opacity-50'
                  : 'bg-red-700   hover:bg-red-600   disabled:opacity-50'
              }`}
            >
              {isPlacingOrder
                ? <><span className="animate-spin">⟳</span> Envoi en cours...</>
                : <>{isLong ? '🟢' : '🔴'} Ouvrir {side} sur {platform?.label}</>
              }
            </button>
          ) : (
            <div className="w-full bg-gray-800 border border-gray-700 text-gray-500 text-xs py-2 rounded-lg text-center">
              🔒 Configurer les clés pour trader
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeltaNeutralPage() {
  const [marketId,    setMarketId]    = useState('BTC');
  const [platform1,   setPlatform1]   = useState('hyperliquid');
  const [platform2,   setPlatform2]   = useState('extended');
  const [sizeUSD,     setSizeUSD]     = useState('');
  const [useStepSize, setUseStepSize] = useState(false);
  const [fees,        setFees]        = useState(loadFees);
  
  //const { getPrice, getStepSize, getExtPrecision } = useLivePrices();
  const { getPrice, getStepSize, getExtPrecision, lastUpdate } = useLivePrices(3000);
  const { getAssetMeta } = useHLMeta();

  const [hlAddress, setHlAddress] = useState(
    () => localStorage.getItem('hl_address') || ''
  );
  const [extApiKey, setExtApiKey] = useState(
    () => getExtendedApiKeys()[0]?.apiKey || ''
  );

  const { placeOrder, canTradeHL, canTradeExt } = usePlaceOrder();
  const [placingLeg1, setPlacingLeg1] = useState(false);
  const [placingLeg2, setPlacingLeg2] = useState(false);
  const [tradeStatus, setTradeStatus] = useState(null); // { type: 'success'|'error', msg: string }

  const saveHlAddress = (addr) => {
    setHlAddress(addr);
    localStorage.setItem('hl_address', addr);
  };

  const saveExtKey = (key) => {
    setExtApiKey(key);
    saveExtendedApiKey(key, 'Delta Neutral');
  };

  // Position déjà chargée depuis PositionLoader ?
  const [loadedPosition, setLoadedPosition] = useState(null);
  
  // ✅ Dans le composant
  const handleLoadPosition = (pos) => {
  setLoadedPosition(pos);
  if (pos.marketId)  setMarketId(pos.marketId);
  setPlatform1(pos.platform);
  setSizeUSD(pos.sizeUSD);
};

const canTradePlatform = (platformId) => {
  if (platformId === 'extended') return canTradeExt;
  return canTradeHL;
};

const buildOrderParams = (platformId, side, sizeAsset, limitPrice) => {
  const hlKey = market?.hlKey;
  const meta  = getAssetMeta(hlKey);

  // ✅ Précisions selon la plateforme
  const szDecimals = platformId === 'extended'
    ? (getExtPrecision(market?.extKey)?.szDecimals ?? 2)
    : (meta?.szDecimals ?? 6);
  const pxDecimals = platformId === 'extended'
    ? (getExtPrecision(market?.extKey)?.pxDecimals ?? 2)
    : (meta?.pxDecimals ?? 2);

  return {
    platformId,
    hlKey,
    extKey:     market?.extKey,
    assetIndex: meta?.index ?? 0,
    isBuy:      side === 'LONG',
    size: useStepSize && getStepSize(marketId)
      ? Math.floor(sizeAsset / getStepSize(marketId)) * getStepSize(marketId)
      : sizeAsset,
    limitPrice,
    szDecimals,
    pxDecimals,
  };
};

const handlePlaceLeg = async (legNum) => {
  const setter    = legNum === 1 ? setPlacingLeg1 : setPlacingLeg2;
  const platformId = legNum === 1 ? platform1 : platform2;
  const side      = legNum === 1 ? side1 : side2;
  const sizeAsset = legNum === 1 ? calc?.asset1 : calc?.asset2;
  const limitPx   = legNum === 1 ? calc?.limitP1 : calc?.limitP2;

  setter(true);
  setTradeStatus(null);
  try {
    await placeOrder(buildOrderParams(platformId, side, sizeAsset, limitPx));
    setTradeStatus({ type: 'success', msg: `✅ Ordre ${side} envoyé sur ${PLATFORMS.find(p => p.id === platformId)?.label}` });
  } catch (e) {
    setTradeStatus({ type: 'error', msg: `❌ Erreur : ${e.message}` });
  } finally {
    setter(false);
  }
};

const handlePlaceBothLegs = async () => {
  setPlacingLeg1(true);
  setPlacingLeg2(true);
  setTradeStatus(null);
  try {
    await Promise.all([
      placeOrder(buildOrderParams(platform1, side1, calc?.asset1, calc?.limitP1)),
      placeOrder(buildOrderParams(platform2, side2, calc?.asset2, calc?.limitP2)),
    ]);
    setTradeStatus({ type: 'success', msg: '✅ Les 2 legs envoyés simultanément !' });
  } catch (e) {
    setTradeStatus({ type: 'error', msg: `❌ Erreur : ${e.message}` });
  } finally {
    setPlacingLeg1(false);
    setPlacingLeg2(false);
  }
};

  //const { getPrice, getStepSize, lastUpdate } = useLivePrices(3000);
  const { p1: fundingP1, p2: fundingP2, extBid, extAsk } = useFundingRates(marketId, platform1, platform2, extApiKey);
  const hlMargin  = useHLMargin(hlAddress);
  const extMargin = useExtMargin(extApiKey);

  const market = MARKETS.find(m => m.id === marketId);
  const plat1  = PLATFORMS.find(p => p.id === platform1);
  const plat2  = PLATFORMS.find(p => p.id === platform2);
  const price1 = getPrice(marketId, platform1);
  const price2 = getPrice(marketId, platform2);
  const book   = useOrderBook(market?.hlKey);

  const getMarginForPlatform = (platformId) => {
    if (platformId === 'extended') return extMargin;
    if (platformId === 'hyena')    return null;
    return hlMargin;
  };

  const suggestion = useMemo(() => {
    if (fundingP1 == null || fundingP2 == null) return null;
    return fundingP1 <= fundingP2
      ? { p1: 'LONG', p2: 'SHORT' }
      : { p1: 'SHORT', p2: 'LONG' };
  }, [fundingP1, fundingP2]);

  const side1 = suggestion?.p1 ?? 'LONG';
  const side2 = suggestion?.p2 ?? 'SHORT';

  const calc = useMemo(() => {
    const val = parseFloat(sizeUSD);
    if (!val || val <= 0 || !price1 || !price2) return null;

    const asset1    = val / price1;
    const asset2    = val / price2;
    const spreadPct = ((price1 - price2) / price2) * 100;
    const fallback  = 0.0005;

    const limitP1 = platform1 === 'extended'
      ? (side1 === 'LONG' ? (extAsk ?? price1 * (1 - fallback)) : (extBid ?? price1 * (1 + fallback)))
      : (side1 === 'LONG' ? (book.ask ?? price1 * (1 - fallback)) : (book.bid ?? price1 * (1 + fallback)));

    const limitP2 = platform2 === 'extended'
      ? (side2 === 'LONG' ? (extAsk ?? price2 * (1 - fallback)) : (extBid ?? price2 * (1 + fallback)))
      : (side2 === 'LONG' ? (price2 * (1 - fallback)) : (price2 * (1 + fallback)));

    return {
      asset1,
      asset2,
      spreadPct,
      limitP1,
      limitP2,
      leverage1: minLeverageFor(val, getMarginForPlatform(platform1)),
      leverage2: minLeverageFor(val, getMarginForPlatform(platform2)),
    };
  }, [sizeUSD, price1, price2, side1, side2, book, extBid, extAsk, platform1, platform2, hlMargin, extMargin]);

  const fresh = lastUpdate && (Date.now() - lastUpdate.getTime()) < 6000;

  const handleFeeChange = (platformId, type, value) => {
    const updated = { ...fees, [platformId]: { ...fees[platformId], [type]: value } };
    setFees(updated);
    saveFees(updated);
  };

  return (
    <div className="px-4 pb-8 flex flex-col gap-4 pt-2">

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
          Position Delta Neutral
        </h2>
        <div className="flex items-center text-xs text-gray-500">
          <PriceDot fresh={fresh} />
          {lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString('fr-FR')}` : 'Chargement...'}
        </div>
      </div>

      <WalletConfigPanel
        hlAddress={hlAddress}
        onHlChange={saveHlAddress}
        extApiKey={extApiKey}
        onExtChange={saveExtKey}
      />

      {/* ✅ Position Loader — HL + Extended */}
      {(hlAddress || extApiKey) && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 px-4 py-3">
          <p className="text-xs text-gray-500 mb-2 font-medium">
            📊 Positions ouvertes (HL / trade.xyz / HyENA / Extended)
          </p>
          <PositionLoader
            address={hlAddress}
            extApiKey={extApiKey}
            onLoad={handleLoadPosition}
            getPrice={getPrice}
          />
        </div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Marché</label>
            <select
              value={marketId}
              onChange={e => setMarketId(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {['Crypto', 'Indices', 'Commodités', 'Equities'].map(cat => (
                <optgroup key={cat} label={cat}>
                  {MARKETS.filter(m => m.category === cat).map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Plateforme 1</label>
            <select
              value={platform1}
              onChange={e => setPlatform1(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {PLATFORMS.filter(p => p.id !== platform2).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Plateforme 2</label>
            <select
              value={platform2}
              onChange={e => setPlatform2(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {PLATFORMS.filter(p => p.id !== platform1).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Taille (USD notionnel)</label>
            <input
              type="number"
              value={sizeUSD}
              onChange={e => setSizeUSD(e.target.value)}
              placeholder="ex: 1000"
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {(suggestion || fundingP1 != null || fundingP2 != null) && (
          <div className="rounded-lg px-3 py-2 bg-blue-900/20 border border-blue-700 text-xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1 flex-1">
              <p className="text-blue-300 font-bold">💡 Direction optimale selon les funding rates</p>
              <p className="text-gray-400">
                {suggestion && (
                  <>
                    <span className="text-green-400 font-medium">{plat1?.label} → {suggestion.p1}</span>
                    {' · '}
                    <span className="text-red-400 font-medium">{plat2?.label} → {suggestion.p2}</span>
                    {' · '}
                  </>
                )}
                {fundingP1 != null && fundingP2 != null && (
                  <span className="text-gray-500">
                    Différentiel : {fmtPct(Math.abs(fundingP1 - fundingP2))} /h
                    {' '}({fmtPct(Math.abs(fundingP1 - fundingP2) * 24 * 365)} /an)
                  </span>
                )}
              </p>
            </div>
            <div
              className="flex items-center gap-2 cursor-pointer shrink-0"
              onClick={() => setUseStepSize(s => !s)}
            >
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                useStepSize ? 'bg-blue-600' : 'bg-gray-600'
              }`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  useStepSize ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">Step size</span>
            </div>
          </div>
        )}
      </div>

      <FeeConfigPanel fees={fees} onChange={handleFeeChange} />

      {calc?.spreadPct != null && (
        <div className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between ${
          Math.abs(calc.spreadPct) > 0.1
            ? 'bg-yellow-900/30 border border-yellow-700'
            : 'bg-gray-900 border border-gray-700'
        }`}>
          <span className="text-gray-400">
            Écart de prix {plat1?.label} / {plat2?.label}
          </span>
          <span className={`font-bold ${Math.abs(calc.spreadPct) > 0.1 ? 'text-yellow-400' : 'text-white'}`}>
            {calc.spreadPct > 0 ? '+' : ''}{calc.spreadPct.toFixed(4)}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LegCard
          side={side1}
          platform={plat1}
          price={price1}
          limitPrice={calc?.limitP1}
          leverage={calc?.leverage1}
          sizeUSD={parseFloat(sizeUSD) || null}
          sizeAsset={calc?.asset1}
          marginAvailable={getMarginForPlatform(platform1)}
          fundingRate={fundingP1}
          isSuggested={!!suggestion}
          feesMaker={fees[platform1]?.maker ?? 0}
          feesTaker={fees[platform1]?.taker ?? 0}
          useStepSize={useStepSize}
          stepSize={getStepSize(marketId)}
          canTrade={canTradePlatform(platform1)}
          onPlaceOrder={() => handlePlaceLeg(1)}
          isPlacingOrder={placingLeg1}
        />
        <LegCard
          side={side2}
          platform={plat2}
          price={price2}
          limitPrice={calc?.limitP2}
          leverage={calc?.leverage2}
          sizeUSD={parseFloat(sizeUSD) || null}
          sizeAsset={calc?.asset2}
          marginAvailable={getMarginForPlatform(platform2)}
          fundingRate={fundingP2}
          isSuggested={!!suggestion}
          feesMaker={fees[platform2]?.maker ?? 0}
          feesTaker={fees[platform2]?.taker ?? 0}
          useStepSize={useStepSize}
          stepSize={getStepSize(marketId)}
          canTrade={canTradePlatform(platform2)}
          onPlaceOrder={() => handlePlaceLeg(2)}
          isPlacingOrder={placingLeg2}
        />
      </div>
{/* ── Feedback statut ── */}
{tradeStatus && (
  <div className={`rounded-lg px-4 py-3 text-sm font-medium text-center ${
    tradeStatus.type === 'success'
      ? 'bg-green-900/40 border border-green-700 text-green-300'
      : 'bg-red-900/40   border border-red-700   text-red-300'
  }`}>
    {tradeStatus.msg}
  </div>
)}

{/* ── Bouton 2 legs simultanés (si aucune position chargée) ── */}
{calc && !loadedPosition && (canTradeHL || canTradeExt) && (
  <button
    onClick={handlePlaceBothLegs}
    disabled={placingLeg1 || placingLeg2 || !calc.limitP1 || !calc.limitP2}
    className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
  >
    {(placingLeg1 || placingLeg2)
      ? <><span className="animate-spin">⟳</span> Envoi des 2 legs...</>
      : <>🚀 Ouvrir les 2 legs simultanément — {plat1?.label} + {plat2?.label}</>
    }
  </button>
)}

{/* ── Bouton 1 leg restant (si position déjà chargée) ── */}
{calc && loadedPosition && (
  <div className="rounded-xl border border-yellow-700 bg-yellow-900/20 px-4 py-3 flex flex-col gap-2">
    <p className="text-xs text-yellow-400 font-medium">
      ⚡ Position {loadedPosition.side} déjà ouverte sur {PLATFORMS.find(p => p.id === loadedPosition.platform)?.label} — ouverture du leg manquant uniquement
    </p>
    <button
      onClick={() => handlePlaceLeg(loadedPosition.platform === platform1 ? 2 : 1)}
      disabled={placingLeg1 || placingLeg2}
      className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
    >
      {(placingLeg1 || placingLeg2)
        ? <><span className="animate-spin">⟳</span> Envoi...</>
        : <>🚀 Ouvrir le leg manquant</>
      }
    </button>
    <button
      onClick={() => setLoadedPosition(null)}
      className="text-xs text-gray-500 hover:text-gray-300 text-center transition-colors"
    >
      ✕ Annuler (ouvrir les 2 legs)
    </button>
  </div>
)}
    </div>
  );
}

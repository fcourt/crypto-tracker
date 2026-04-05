import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLivePrices, MARKETS, PLATFORMS } from '../hooks/useLivePrices';
import { useFundingRates } from '../hooks/useFundingRates';
import { getExtendedApiKeys, saveExtendedApiKey } from '../hooks/useExtendedData';
import { usePlaceOrder } from '../hooks/usePlaceOrder';
import { useHLMeta } from '../hooks/useHLMeta';

// ─── Constants ────────────────────────────────────────────────────────────────

const HL_API = 'https://api.hyperliquid.xyz/info';
const LEVERAGE_STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 50];
const DEFAULT_FEES = {
  hyperliquid: { maker: 0.0001,  taker: 0.00035 },
  xyz:         { maker: 0.00003, taker: 0.00009 },
  hyena:       { maker: 0.0002,  taker: 0.0005  },
  extended:    { maker: 0.0002,  taker: 0.0005  },
};
const FEES_STORAGE_KEY = 'dn_platform_fees';
const DN_TRADES_KEY    = 'dn_open_trades';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt    = (n, d = 2) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n);
const fmtUSD = (n) => n == null ? '—' : (n < 0 ? '-$' : '$') + fmt(Math.abs(n), 2);
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
function saveFees(fees) { localStorage.setItem(FEES_STORAGE_KEY, JSON.stringify(fees)); }

// ─── Break-Even Calculator ────────────────────────────────────────────────────

function computeBE({ leg1, leg2, fees, includeFees, includeFunding, currentPx1, currentPx2 }) {
  if (!leg1 || !leg2) return null;

  const entryPx1 = leg1.entryPx ?? 0;
  const entryPx2 = leg2.entryPx ?? 0;
  const size1    = leg1.szi ?? 0;
  const size2    = leg2.szi ?? 0;

  const fundingPnl = includeFunding
    ? ((leg1.unrealizedPnl ?? 0) + (leg2.unrealizedPnl ?? 0) - rawPricePnl(leg1, leg2, currentPx1, currentPx2))
    : 0;

  const exitPx1Est = currentPx1 ?? entryPx1;
  const exitPx2Est = currentPx2 ?? entryPx2;

  const feeOpen1  = includeFees ? (entryPx1   * size1 * (fees[leg1.platform]?.taker ?? fees[leg1.platform]?.maker ?? 0)) : 0;
  const feeOpen2  = includeFees ? (entryPx2   * size2 * (fees[leg2.platform]?.taker ?? fees[leg2.platform]?.maker ?? 0)) : 0;
  const feeClose1 = includeFees ? (exitPx1Est * size1 * (fees[leg1.platform]?.taker ?? 0)) : 0;
  const feeClose2 = includeFees ? (exitPx2Est * size2 * (fees[leg2.platform]?.taker ?? 0)) : 0;
  const totalFees = feeOpen1 + feeOpen2 + feeClose1 + feeClose2;

  const pricePnl = rawPricePnl(leg1, leg2, exitPx1Est, exitPx2Est);
  const pnlNet   = pricePnl - totalFees + fundingPnl;

  const shortPnl      = (leg2.side === 'SHORT' ? 1 : -1) * (entryPx2 - exitPx2Est) * size2;
  const needFromLong  = totalFees - fundingPnl - shortPnl;
  const bePx1 = leg1.side === 'LONG'
    ? entryPx1 + needFromLong / size1
    : entryPx1 - needFromLong / size1;

  const longPnl       = (leg1.side === 'LONG' ? 1 : -1) * (exitPx1Est - entryPx1) * size1;
  const needFromShort = totalFees - fundingPnl - longPnl;
  const bePx2 = leg2.side === 'SHORT'
    ? entryPx2 - needFromShort / size2
    : entryPx2 + needFromShort / size2;

  return { pnlNet, pricePnl, totalFees, fundingPnl, bePx1, bePx2 };
}

function rawPricePnl(leg1, leg2, px1, px2) {
  if (!leg1 || !leg2 || !px1 || !px2) return 0;
  const pnl1 = leg1.side === 'LONG' ? (px1 - leg1.entryPx) * leg1.szi : (leg1.entryPx - px1) * leg1.szi;
  const pnl2 = leg2.side === 'LONG' ? (px2 - leg2.entryPx) * leg2.szi : (leg2.entryPx - px2) * leg2.szi;
  return pnl1 + pnl2;
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
  } catch (e) { console.warn('fetchHLPositions error:', e.message); return []; }
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
  } catch (e) { console.warn('fetchExtPositions error:', e.message); return []; }
}

// ─── Local hooks ──────────────────────────────────────────────────────────────

function useHLMargin(address) {
  const [margin, setMargin] = useState(null);
  useEffect(() => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    const run = async () => {
      try {
        const res   = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: address }) });
        const state = await res.json();
        setMargin(parseFloat(state?.crossMarginSummary?.accountValue || 0) - parseFloat(state?.crossMarginSummary?.totalMarginUsed || 0));
      } catch { setMargin(null); }
    };
    run();
    const t = setInterval(run, 15000);
    return () => clearInterval(t);
  }, [address]);
  return margin;
}

function useExtMargin(apiKey) {
  const [margin, setMargin] = useState(null);
  useEffect(() => {
    if (!apiKey?.trim()) return;
    const run = async () => {
      try {
        const res  = await fetch(`/api/extended?endpoint=${encodeURIComponent('/user/balance')}`, { headers: { 'X-Api-Key': apiKey } });
        const data = await res.json();
        setMargin(parseFloat(data?.data?.availableForTrade || 0));
      } catch { setMargin(null); }
    };
    run();
    const t = setInterval(run, 15000);
    return () => clearInterval(t);
  }, [apiKey]);
  return margin;
}

function useOrderBook(hlKey) {
  const [book, setBook] = useState({ bid: null, ask: null });
  useEffect(() => {
    if (!hlKey) return;
    const run = async () => {
      try {
        const res  = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'l2Book', coin: hlKey }) });
        const data = await res.json();
        const bid  = parseFloat(data?.levels?.[0]?.[0]?.px);
        const ask  = parseFloat(data?.levels?.[1]?.[0]?.px);
        setBook({ bid: isNaN(bid) ? null : bid, ask: isNaN(ask) ? null : ask });
      } catch { setBook({ bid: null, ask: null }); }
    };
    run();
    const t = setInterval(run, 5000);
    return () => clearInterval(t);
  }, [hlKey]);
  return book;
}

function useOpenPositions(address, extApiKey) {
  const [positions, setPositions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hlPos, extPos] = await Promise.all([fetchHLPositions(address), fetchExtPositions(extApiKey)]);
      setPositions([...hlPos, ...extPos]);
    } catch (e) { console.warn('useOpenPositions error:', e.message); }
    finally { setLoading(false); }
  }, [address, extApiKey]);
  return { positions, loading, load };
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function PriceDot({ fresh }) {
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${fresh ? 'bg-green-400' : 'bg-yellow-500'}`} />;
}

function DropSection({ title, defaultOpen = false, badge = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-semibold flex items-center gap-2">
          {title}
          {badge != null && (
            <span className="text-xs bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">{badge}</span>
          )}
        </span>
        <span className="text-gray-600">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="border-t border-gray-700/60">{children}</div>}
    </div>
  );
}

// ─── Section 1: Wallet & API Keys ────────────────────────────────────────────

function WalletConfigPanel({ hlAddress, onHlChange, extApiKey, onExtChange }) {
  const [open, setOpen] = useState(!hlAddress && !extApiKey);
  const [hlAgentPk,      setHlAgentPk]      = useState(() => localStorage.getItem('hl_agent_pk')      || '');
  const [hlVaultAddress, setHlVaultAddress]  = useState(() => localStorage.getItem('hl_vault_address') || '');
  const [extStarkPk,     setExtStarkPk]      = useState(() => localStorage.getItem('ext_stark_pk')     || '');
  const [extL2Vault,     setExtL2Vault]      = useState(() => localStorage.getItem('ext_l2_vault')     || '');

  const saveHlAgentPk      = v => { setHlAgentPk(v);      localStorage.setItem('hl_agent_pk', v); };
  const saveHlVaultAddress = v => { setHlVaultAddress(v); localStorage.setItem('hl_vault_address', v); };
  const saveExtStarkPk     = v => { setExtStarkPk(v);     localStorage.setItem('ext_stark_pk', v); };
  const saveExtL2Vault     = v => { setExtL2Vault(v);     localStorage.setItem('ext_l2_vault', v); };

  const canTradeHL  = !!hlAgentPk;
  const canTradeExt = !!extStarkPk && !!extL2Vault;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors">
        <span className="font-semibold flex items-center gap-2 flex-wrap">
          🔑 Wallets &amp; API Keys
          {hlAddress   ? <span className="text-green-400">● HL connecté</span>   : <span className="text-red-400">● HL non configuré</span>}
          {canTradeHL  ? <span className="text-green-400">● HL trading ✓</span>  : <span className="text-yellow-500">● HL trading ⚠</span>}
          {extApiKey   ? <span className="text-green-400">● EXT connecté</span>  : <span className="text-yellow-500">● EXT non configuré</span>}
          {canTradeExt ? <span className="text-green-400">● EXT trading ✓</span> : <span className="text-yellow-500">● EXT trading ⚠</span>}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-5 border-t border-gray-700/60">
          {/* Hyperliquid */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-blue-400 border-b border-gray-700 pb-1">Hyperliquid / trade.xyz / HyENA</p>
            {[
              { label: 'Adresse compte principal', val: hlAddress,      setter: onHlChange,         type: 'text',     hint: 'Lecture positions & marge' },
              { label: 'Clé privée Agent Wallet',  val: hlAgentPk,      setter: saveHlAgentPk,      type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
              { label: 'Adresse sous-compte',      val: hlVaultAddress, setter: saveHlVaultAddress, type: 'text',     hint: 'Optionnel — laisser vide pour compte principal' },
            ].map(({ label, val, setter, type, hint }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{label}</label>
                <div className="flex gap-2">
                  <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder="0x..."
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500" />
                  {val && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
                </div>
                <p className="text-gray-600 text-xs">{hint}</p>
              </div>
            ))}
          </div>
          {/* Extended */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-purple-400 border-b border-gray-700 pb-1">Extended Exchange</p>
            {[
              { label: 'Clé API (lecture)',     val: extApiKey,  setter: onExtChange,      type: 'password', hint: 'Marge, positions, funding rates' },
              { label: 'Stark Private Key',     val: extStarkPk, setter: saveExtStarkPk,   type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
              { label: 'l2Vault (ID position)', val: extL2Vault, setter: saveExtL2Vault,   type: 'text',     hint: 'Extended › Account › API Management' },
            ].map(({ label, val, setter, type, hint }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{label}</label>
                <div className="flex gap-2">
                  <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder="..."
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500" />
                  {val && <span className="flex items-center text-xs text-green-400 px-2">✓</span>}
                </div>
                <p className="text-gray-600 text-xs">{hint}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-700 pt-3">
            <button
              onClick={() => {
                if (!confirm('Effacer toutes les clés sauvegardées ?')) return;
                ['hl_address','hl_agent_pk','hl_vault_address','ext_stark_pk','ext_l2_vault','extended_api_keys'].forEach(k => localStorage.removeItem(k));
                onHlChange(''); onExtChange(''); saveHlAgentPk(''); saveHlVaultAddress(''); saveExtStarkPk(''); saveExtL2Vault('');
              }}
              className="w-full bg-red-900/30 hover:bg-red-800/50 border border-red-700 text-red-400 text-xs font-medium py-2 rounded-lg transition-colors"
            >🗑️ Effacer toutes les clés</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Fee Config ────────────────────────────────────────────────────

function FeeConfigPanel({ fees, onChange }) {
  const [fetching, setFetching] = useState({});

  const fetchExtFee = async (pid) => {
    setFetching(f => ({ ...f, [pid]: true }));
    try {
      const res  = await fetch(`/api/extended?endpoint=${encodeURIComponent('/info/markets')}`);
      const data = await res.json();
      console.log('Extended market fee data:', (data?.data || [])[0]);
    } catch (e) { console.warn('fetchExtFee error:', e); }
    finally { setFetching(f => ({ ...f, [pid]: false })); }
  };

  const fetchHLFee = async () => {
    setFetching(f => ({ ...f, hyperliquid: true }));
    try {
      const res  = await fetch(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'meta' }) });
      const data = await res.json();
      console.log('HL fee meta:', data?.feeTiers);
    } catch (e) { console.warn('fetchHLFee error:', e); }
    finally { setFetching(f => ({ ...f, hyperliquid: false })); }
  };

  return (
    <DropSection title="⚙️ Taux de fees par plateforme">
      <div className="px-4 py-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500">Ces fees alimentent le calcul du P&amp;L break-even dans la section Trades Ouverts.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(fees).map(([pid, f]) => {
            const plat = PLATFORMS.find(p => p.id === pid);
            return (
              <div key={pid} className="bg-gray-900 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-200">{plat?.label ?? pid}</p>
                  <button
                    onClick={() => pid === 'hyperliquid' ? fetchHLFee() : fetchExtFee(pid)}
                    disabled={fetching[pid]}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    title="Recharger depuis l'API"
                  >
                    {fetching[pid] ? <span className="animate-spin inline-block">⟳</span> : '🔄'}
                  </button>
                </div>
                <label className="text-xs text-gray-500">Maker (%)</label>
                <input type="number" step="0.001" min="0"
                  value={(f.maker * 100).toFixed(3)}
                  onChange={e => onChange(pid, 'maker', parseFloat(e.target.value) / 100)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <label className="text-xs text-gray-500">Taker (%)</label>
                <input type="number" step="0.001" min="0"
                  value={(f.taker * 100).toFixed(3)}
                  onChange={e => onChange(pid, 'taker', parseFloat(e.target.value) / 100)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            );
          })}
        </div>
      </div>
    </DropSection>
  );
}

// ─── Section 3: LegCard ───────────────────────────────────────────────────────

function LegCard({
  side, platform, price, limitPrice, leverage, sizeUSD, sizeAsset, marginAvailable,
  fundingRate, isSuggested, feesMaker, feesTaker, useStepSize, stepSize,
  onPlaceOrder, isPlacingOrder, canTrade, orderType, onOrderTypeChange,
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
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${isLong ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isLong ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>{side}</span>
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
          <p className="text-gray-500 text-xs">Size {useStepSize && <span className="text-blue-400 ml-1">step</span>}</p>
          <p className="text-white font-bold">{sizeDisplay ? fmt(sizeDisplay, 6) : '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Levier min.</p>
          <p className="text-blue-300 font-bold text-lg">{leverage != null ? `${leverage}x` : '—'}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Marge dispo</p>
          <p className={`font-bold ${marginAvailable == null ? 'text-gray-500' : marginAvailable > 0 ? 'text-green-300' : 'text-red-400'}`}>
            {marginAvailable != null ? fmtUSD(marginAvailable) : '—'}
          </p>
        </div>
      </div>
      <div className="bg-gray-900 rounded-lg px-3 py-2">
        <p className="text-gray-500 text-xs mb-1">Funding (1h)</p>
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div>
            <span className={`font-bold text-sm ${fundingRate == null ? 'text-gray-500' : fundingRate >= 0 ? 'text-orange-400' : 'text-green-400'}`}>{fmtPct(fundingRate)}</span>
            <span className="text-gray-500 text-xs ml-1">({fmtPct(fundingRate != null ? fundingRate * 24 * 365 : null)} /an)</span>
          </div>
          {fundingNet != null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${fundingNet >= 0 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              {side} {receivePay} le funding
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg px-3 py-2 ${orderType === 'taker' ? 'bg-orange-900/30 border border-orange-700' : 'bg-gray-900'}`}>
          <p className="text-gray-500 text-xs">Fees taker</p>
          <p className="text-yellow-300 font-bold">{feeTaker != null ? fmtUSD(feeTaker) : '—'}</p>
          <p className="text-gray-600 text-xs">{(feesTaker * 100).toFixed(3)}%</p>
        </div>
        <div className={`rounded-lg px-3 py-2 ${orderType === 'maker' ? 'bg-blue-900/30 border border-blue-700' : 'bg-gray-900'}`}>
          <p className="text-gray-500 text-xs">Fees maker</p>
          <p className="text-yellow-300 font-bold">{feeMaker != null ? fmtUSD(feeMaker) : '—'}</p>
          <p className="text-gray-600 text-xs">{(feesMaker * 100).toFixed(3)}%</p>
        </div>
      </div>
      <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs font-medium">
        <button onClick={() => onOrderTypeChange('taker')} className={`flex-1 py-2 transition-colors ${orderType === 'taker' ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>⚡ Market — Taker</button>
        <button onClick={() => onOrderTypeChange('maker')} className={`flex-1 py-2 transition-colors ${orderType === 'maker' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>📋 Limit — Maker</button>
      </div>
      {sizeDisplay && (
        <div className="flex flex-col gap-2">
          <button onClick={() => navigator.clipboard.writeText(sizeDisplay.toFixed(6))} className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 rounded-lg transition-colors">
            📋 Copier size : {fmt(sizeDisplay, 6)}
          </button>
          {canTrade ? (
            <button onClick={onPlaceOrder} disabled={isPlacingOrder || !limitPrice || !sizeDisplay}
              className={`w-full text-white text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${isLong ? 'bg-green-700 hover:bg-green-600 disabled:opacity-50' : 'bg-red-700 hover:bg-red-600 disabled:opacity-50'}`}>
              {isPlacingOrder ? <><span className="animate-spin">⟳</span> Envoi...</> : <>{isLong ? '🟢' : '🔴'} Ouvrir {side} sur {platform?.label}</>}
            </button>
          ) : (
            <div className="w-full bg-gray-800 border border-gray-700 text-gray-500 text-xs py-2 rounded-lg text-center">🔒 Configurer les clés pour trader</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: OpenTradeSection ─────────────────────────────────────────────

function OpenTradeSection({
  market, platform1, platform2, plat1, plat2, price1, price2,
  sizeUSD, setSizeUSD, side1, side2, calc, fees,
  useStepSize, setUseStepSize, getStepSize, marketId, setMarketId,
  setPlatform1, setPlatform2, fundingP1, fundingP2, suggestion, book, extBid, extAsk,
  hlMargin, extMargin, getMarginForPlatform, canTradePlatform,
  orderType1, setOrderType1, orderType2, setOrderType2,
  placingLeg1, placingLeg2, tradeStatus, handlePlaceLeg, handlePlaceBothLegs,
  loadedPosition1, loadedPosition2, setLoadedPosition1, setLoadedPosition2,
}) {
  return (
    <DropSection title="📈 Ouvrir un trade Delta Neutral" defaultOpen={true}>
      <div className="px-4 py-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Marché</label>
            <select value={marketId} onChange={e => setMarketId(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              {['Crypto','Indices','Commodités','Equities'].map(cat => (
                <optgroup key={cat} label={cat}>
                  {MARKETS.filter(m => m.category === cat).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Plateforme 1</label>
            <select value={platform1} onChange={e => setPlatform1(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              {PLATFORMS.filter(p => p.id !== platform2).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Plateforme 2</label>
            <select value={platform2} onChange={e => setPlatform2(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              {PLATFORMS.filter(p => p.id !== platform1).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Taille (USD notionnel)</label>
            <input type="number" value={sizeUSD} onChange={e => setSizeUSD(e.target.value)} placeholder="ex: 1000"
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {(suggestion || fundingP1 != null || fundingP2 != null) && (
          <div className="rounded-lg px-3 py-2 bg-blue-900/20 border border-blue-700 text-xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1 flex-1">
              <p className="text-blue-300 font-bold">💡 Direction optimale selon les funding rates</p>
              <p className="text-gray-400">
                {suggestion && (<><span className="text-green-400 font-medium">{plat1?.label} → {suggestion.p1}</span>{' · '}<span className="text-red-400 font-medium">{plat2?.label} → {suggestion.p2}</span>{' · '}</>)}
                {fundingP1 != null && fundingP2 != null && (
                  <span className="text-gray-500">Diff : {fmtPct(Math.abs(fundingP1 - fundingP2))} /h ({fmtPct(Math.abs(fundingP1 - fundingP2) * 24 * 365)} /an)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => setUseStepSize(s => !s)}>
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${useStepSize ? 'bg-blue-600' : 'bg-gray-600'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${useStepSize ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">Step size</span>
            </div>
          </div>
        )}

        {calc?.spreadPct != null && (
          <div className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between ${Math.abs(calc.spreadPct) > 0.1 ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-gray-900 border border-gray-700'}`}>
            <span className="text-gray-400">Écart de prix {plat1?.label} / {plat2?.label}</span>
            <span className={`font-bold ${Math.abs(calc.spreadPct) > 0.1 ? 'text-yellow-400' : 'text-white'}`}>
              {calc.spreadPct > 0 ? '+' : ''}{calc.spreadPct.toFixed(4)}%
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LegCard side={side1} platform={plat1} price={price1} limitPrice={calc?.limitP1} leverage={calc?.leverage1}
            sizeUSD={parseFloat(sizeUSD) || null} sizeAsset={calc?.asset1} marginAvailable={getMarginForPlatform(platform1)}
            fundingRate={fundingP1} isSuggested={!!suggestion} feesMaker={fees[platform1]?.maker ?? 0} feesTaker={fees[platform1]?.taker ?? 0}
            useStepSize={useStepSize} stepSize={getStepSize(marketId)} orderType={orderType1} onOrderTypeChange={setOrderType1}
            canTrade={canTradePlatform(platform1)} onPlaceOrder={() => handlePlaceLeg(1)} isPlacingOrder={placingLeg1} />
          <LegCard side={side2} platform={plat2} price={price2} limitPrice={calc?.limitP2} leverage={calc?.leverage2}
            sizeUSD={parseFloat(sizeUSD) || null} sizeAsset={calc?.asset2} marginAvailable={getMarginForPlatform(platform2)}
            fundingRate={fundingP2} isSuggested={!!suggestion} feesMaker={fees[platform2]?.maker ?? 0} feesTaker={fees[platform2]?.taker ?? 0}
            useStepSize={useStepSize} stepSize={getStepSize(marketId)} orderType={orderType2} onOrderTypeChange={setOrderType2}
            canTrade={canTradePlatform(platform2)} onPlaceOrder={() => handlePlaceLeg(2)} isPlacingOrder={placingLeg2} />
        </div>

        {tradeStatus && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium text-center ${tradeStatus.type === 'success' ? 'bg-green-900/40 border border-green-700 text-green-300' : 'bg-red-900/40 border border-red-700 text-red-300'}`}>
            {tradeStatus.msg}
          </div>
        )}

        {calc && !loadedPosition1 && !loadedPosition2 && (
          <button onClick={handlePlaceBothLegs} disabled={placingLeg1 || placingLeg2 || !calc.limitP1 || !calc.limitP2}
            className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
            {(placingLeg1 || placingLeg2) ? <><span className="animate-spin">⟳</span> Envoi des 2 legs...</> : <>🚀 Ouvrir les 2 legs simultanément — {plat1?.label} + {plat2?.label}</>}
          </button>
        )}

        {calc && (loadedPosition1 || loadedPosition2) && !(loadedPosition1 && loadedPosition2) && (
          <div className="rounded-xl border border-yellow-700 bg-yellow-900/20 px-4 py-3 flex flex-col gap-2">
            <p className="text-xs text-yellow-400 font-medium">
              ⚡ Position {(loadedPosition1 ?? loadedPosition2).side} déjà ouverte sur {PLATFORMS.find(p => p.id === (loadedPosition1 ?? loadedPosition2).platform)?.label} — ouverture du leg manquant uniquement
            </p>
            <button onClick={() => handlePlaceLeg(loadedPosition1 ? 2 : 1)} disabled={placingLeg1 || placingLeg2}
              className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm">
              {(placingLeg1 || placingLeg2) ? <><span className="animate-spin">⟳</span> Envoi...</> : <>🚀 Ouvrir le leg manquant</>}
            </button>
            <button onClick={() => { setLoadedPosition1(null); setLoadedPosition2(null); }} className="text-xs text-gray-500 hover:text-gray-300 text-center transition-colors">✕ Annuler (ouvrir les 2 legs)</button>
          </div>
        )}
      </div>
    </DropSection>
  );
}

// ─── Section 4: Trades Ouverts ────────────────────────────────────────────────

const PLAT_BADGE = {
  hyperliquid: 'bg-blue-900/60 text-blue-300 border-blue-700',
  xyz:         'bg-purple-900/60 text-purple-300 border-purple-700',
  hyena:       'bg-orange-900/60 text-orange-300 border-orange-700',
  extended:    'bg-teal-900/60 text-teal-300 border-teal-700',
};

function PositionCard({ pos, isSelected, onSelect, livePrice }) {
  const pnl = livePrice
    ? (pos.side === 'LONG' ? (livePrice - pos.entryPx) * pos.szi : (pos.entryPx - livePrice) * pos.szi)
    : pos.unrealizedPnl;
  return (
    <button onClick={onSelect}
      className={`w-full text-left rounded-xl border p-3 flex flex-col gap-1.5 transition-all ${isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900/60 hover:border-gray-500'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PLAT_BADGE[pos.platform] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>{PLATFORMS.find(p => p.id === pos.platform)?.label ?? pos.platform}</span>
          <span className="text-sm font-bold text-white">{pos.label || pos.coin}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${pos.side === 'LONG' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{pos.side}</span>
        </div>
        <span className={`text-sm font-bold tabular-nums shrink-0 ${(pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl != null ? `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}` : '—'}
        </span>
      </div>
      <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
        <span>Size : <span className="text-gray-200">{pos.szi}</span></span>
        <span>Entrée : <span className="text-gray-200">${pos.entryPx?.toFixed(2)}</span></span>
        {livePrice && <span>Live : <span className="text-gray-200">${livePrice.toFixed(2)}</span></span>}
      </div>
      {isSelected && <p className="text-xs text-blue-400 font-medium mt-1">✓ Sélectionné pour l'analyse</p>}
    </button>
  );
}

function OpenTradesPanel({ address, extApiKey, fees, getPrice }) {
  const { positions, loading, load } = useOpenPositions(address, extApiKey);
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [includeFees,    setIncludeFees]    = useState(true);
  const [includeFunding, setIncludeFunding] = useState(false);
  const [closeMode,      setCloseMode]      = useState({});
  const [closePrices,    setClosePrices]    = useState({});
  const [closeOType,     setCloseOType]     = useState({});
  const [feedback,       setFeedback]       = useState({});
  const { placeOrder } = usePlaceOrder();

  const posKey = p => `${p.platform}-${p.coin}`;

  const toggleSelect = (key) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else {
        if (next.size >= 2) { const first = next.values().next().value; next.delete(first); }
        next.add(key);
      }
      return next;
    });
  };

  const selectedPositions = positions.filter(p => selectedIds.has(posKey(p)));
  const leg1 = selectedPositions[0] ?? null;
  const leg2 = selectedPositions[1] ?? null;

  const currentPx1 = leg1 ? getPrice(leg1.marketId, leg1.platform) : null;
  const currentPx2 = leg2 ? getPrice(leg2.marketId, leg2.platform) : null;

  const be = useMemo(() =>
    computeBE({ leg1, leg2, fees, includeFees, includeFunding, currentPx1, currentPx2 }),
    [leg1, leg2, fees, includeFees, includeFunding, currentPx1, currentPx2]
  );

  useEffect(() => {
    if (!be) return;
    if (leg1) setClosePrices(p => ({ ...p, [posKey(leg1)]: be.bePx1?.toFixed(2) ?? '' }));
    if (leg2) setClosePrices(p => ({ ...p, [posKey(leg2)]: be.bePx2?.toFixed(2) ?? '' }));
  }, [be?.bePx1, be?.bePx2]);

  const doClose = async (pos, mode) => {
    const key = posKey(pos);
    setFeedback(f => ({ ...f, [key]: null }));
    setCloseMode(m => ({ ...m, [key]: 'pending' }));
    try {
      const lp      = getPrice(pos.marketId, pos.platform);
      const limitPx = mode === 'limit' ? parseFloat(closePrices[key]) : null;
      if (mode === 'limit' && (!limitPx || isNaN(limitPx))) throw new Error('Prix limit invalide');
      const isBuy   = pos.side === 'SHORT';
      const price   = mode === 'market'
        ? (isBuy ? (lp ?? pos.entryPx) * 1.005 : (lp ?? pos.entryPx) * 0.995)
        : limitPx;
      const ot = closeOType[key] ?? (mode === 'market' ? 'taker' : 'maker');
      await placeOrder({ platformId: pos.platform, extKey: pos.coin, isBuy, size: pos.szi, limitPrice: price, orderType: ot, reduceOnly: true });
      setFeedback(f => ({ ...f, [key]: { ok: true, msg: '✅ Ordre envoyé' } }));
      setTimeout(() => load(), 2500);
    } catch (e) {
      setFeedback(f => ({ ...f, [key]: { ok: false, msg: `❌ ${e.message}` } }));
    } finally { setCloseMode(m => ({ ...m, [key]: 'idle' })); }
  };

  const doCloseBoth = async (mode) => {
    if (!leg1 || !leg2) return;
    await Promise.allSettled([doClose(leg1, mode), doClose(leg2, mode)]);
  };

  return (
    <DropSection title="📂 Trades Ouverts" badge={positions.length > 0 ? positions.length : null}>
      <div className="px-4 py-4 flex flex-col gap-4">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors w-fit">
          {loading ? <><span className="animate-spin">⟳</span> Chargement…</> : <>🔄 Charger les positions ouvertes</>}
        </button>

        {!loading && positions.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">Aucune position ouverte détectée</p>
        )}

        {positions.length > 0 && (
          <>
            <p className="text-xs text-gray-500">Sélectionnez jusqu'à 2 positions pour l'analyse delta-neutral ↓</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {positions.map(p => (
                <PositionCard key={posKey(p)} pos={p} isSelected={selectedIds.has(posKey(p))}
                  onSelect={() => toggleSelect(posKey(p))} livePrice={getPrice(p.marketId, p.platform)} />
              ))}
            </div>
          </>
        )}

        {selectedPositions.length > 0 && (
          <div className="rounded-xl border border-gray-600 bg-gray-900/60 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-bold text-white">
                {selectedPositions.length === 2 ? '📊 Analyse Delta Neutral' : '📊 Analyse de position'}
              </p>
              <div className="flex gap-4">
                {[
                  { label: 'Fees',    val: includeFees,    setter: setIncludeFees },
                  { label: 'Funding', val: includeFunding, setter: setIncludeFunding },
                ].map(({ label, val, setter }) => (
                  <label key={label} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400">
                    <div onClick={() => setter(v => !v)} className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${val ? 'bg-blue-600' : 'bg-gray-600'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    Inclure {label}
                  </label>
                ))}
              </div>
            </div>

            {be && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'PnL prix brut', val: be.pricePnl,   color: be.pricePnl  >= 0 ? 'text-green-400' : 'text-red-400' },
                  { label: 'Fees totales',  val: -be.totalFees, color: 'text-yellow-400' },
                  { label: 'Funding',       val: be.fundingPnl, color: be.fundingPnl >= 0 ? 'text-green-400' : 'text-red-400' },
                  { label: 'PnL net',       val: be.pnlNet,     color: be.pnlNet    >= 0 ? 'text-green-400' : 'text-red-400' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-gray-800 rounded-lg px-3 py-2">
                    <p className="text-gray-500 text-xs">{label}</p>
                    <p className={`font-bold text-sm ${color}`}>{fmtUSD(val)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedPositions.map(pos => {
                const key    = posKey(pos);
                const state  = closeMode[key] ?? 'idle';
                const fb     = feedback[key];
                const lp     = getPrice(pos.marketId, pos.platform);
                const bePx   = pos === leg1 ? be?.bePx1 : be?.bePx2;
                const isLong = pos.side === 'LONG';

                return (
                  <div key={key} className={`rounded-xl border p-4 flex flex-col gap-3 ${isLong ? 'border-green-800 bg-green-900/10' : 'border-red-800 bg-red-900/10'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PLAT_BADGE[pos.platform] ?? ''}`}>{PLATFORMS.find(p => p.id === pos.platform)?.label}</span>
                      <span className="text-sm font-bold text-white">{pos.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isLong ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{pos.side}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-xs">
                      {[
                        { label: 'Size',     val: fmt(pos.szi, 6) },
                        { label: 'Entrée',   val: `$${pos.entryPx?.toFixed(2)}` },
                        { label: 'Live',     val: lp ? `$${lp.toFixed(2)}` : '—' },
                        { label: 'BE calc',  val: bePx ? `$${bePx.toFixed(2)}` : '—' },
                        { label: 'PnL brut', val: fmtUSD(lp ? (isLong ? (lp - pos.entryPx) * pos.szi : (pos.entryPx - lp) * pos.szi) : pos.unrealizedPnl) },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-gray-800 rounded px-2 py-1">
                          <p className="text-gray-500" style={{ fontSize: '10px' }}>{label}</p>
                          <p className="text-gray-200 font-medium text-xs">{val}</p>
                        </div>
                      ))}
                    </div>

                    {fb && <p className={`text-xs font-medium ${fb.ok ? 'text-green-400' : 'text-red-400'}`}>{fb.msg}</p>}

                    <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs font-medium">
                      <button onClick={() => setCloseOType(o => ({ ...o, [key]: 'taker' }))} className={`flex-1 py-1.5 transition-colors ${(closeOType[key] ?? 'taker') === 'taker' ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>⚡ Market</button>
                      <button onClick={() => setCloseOType(o => ({ ...o, [key]: 'maker' }))} className={`flex-1 py-1.5 transition-colors ${closeOType[key] === 'maker' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>📋 Limit</button>
                    </div>

                    {(closeOType[key] ?? 'taker') === 'maker' && (
                      <div className="flex items-center gap-2">
                        <input type="number" step="any" value={closePrices[key] ?? ''} onChange={e => setClosePrices(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={lp?.toFixed(2) ?? 'Prix limit'}
                          className="flex-1 px-2 py-1.5 rounded-md bg-gray-800 border border-gray-600 text-gray-200 text-xs focus:outline-none focus:border-blue-500" />
                        {bePx && (
                          <button onClick={() => setClosePrices(p => ({ ...p, [key]: bePx.toFixed(2) }))}
                            className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap px-2 py-1 rounded bg-gray-800 border border-gray-700">
                            ↺ BE
                          </button>
                        )}
                      </div>
                    )}

                    {state === 'pending' ? (
                      <p className="text-xs text-yellow-400 animate-pulse text-center py-1">⏳ Envoi en cours…</p>
                    ) : (
                      <button onClick={() => doClose(pos, closeOType[key] ?? 'taker')}
                        className="w-full bg-red-800 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                        Fermer {pos.side}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedPositions.length === 2 && (
              <div className="border-t border-gray-700 pt-4 flex flex-col gap-2">
                <p className="text-xs text-gray-400 font-medium">⚡ Fermeture simultanée des 2 legs</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => doCloseBoth('taker')} className="bg-red-800 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors">
                    🔴 Market — les 2 simultanément
                  </button>
                  <button onClick={() => doCloseBoth('maker')} className="bg-orange-800 hover:bg-orange-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors">
                    📋 Limit BE — les 2 simultanément
                  </button>
                </div>
                {be && (
                  <p className={`text-xs text-center font-medium ${be.pnlNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    PnL net estimé si fermeture maintenant : {fmtUSD(be.pnlNet)}
                    {includeFees && ` (dont fees : ${fmtUSD(-be.totalFees)})`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DropSection>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeltaNeutralPage() {
  const [marketId,        setMarketId]        = useState('BTC');
  const [platform1,       setPlatform1]       = useState('hyperliquid');
  const [platform2,       setPlatform2]       = useState('extended');
  const [sizeUSD,         setSizeUSD]         = useState('');
  const [useStepSize,     setUseStepSize]     = useState(false);
  const [fees,            setFees]            = useState(loadFees);
  const [orderType1,      setOrderType1]      = useState('maker');
  const [orderType2,      setOrderType2]      = useState('maker');
  const [loadedPosition1, setLoadedPosition1] = useState(null);
  const [loadedPosition2, setLoadedPosition2] = useState(null);
  const [placingLeg1,     setPlacingLeg1]     = useState(false);
  const [placingLeg2,     setPlacingLeg2]     = useState(false);
  const [tradeStatus,     setTradeStatus]     = useState(null);

  const { getPrice, getStepSize, getExtPrecision, lastUpdate } = useLivePrices(3000);
  const { getAssetMeta } = useHLMeta();

  const [hlAddress, setHlAddress] = useState(() => localStorage.getItem('hl_address') || '');
  const [extApiKey, setExtApiKey] = useState(() => getExtendedApiKeys()[0]?.apiKey || '');

  const { placeOrder, canTradeHL, canTradeExt } = usePlaceOrder();

  const saveHlAddress = (addr) => { setHlAddress(addr); localStorage.setItem('hl_address', addr); };
  const saveExtKey    = (key)  => { setExtApiKey(key);  saveExtendedApiKey(key, 'Delta Neutral'); };

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

  const canTradePlatform = (platformId) => platformId === 'extended' ? canTradeExt : canTradeHL;

  const suggestion = useMemo(() => {
    if (fundingP1 == null || fundingP2 == null) return null;
    return fundingP1 <= fundingP2 ? { p1: 'LONG', p2: 'SHORT' } : { p1: 'SHORT', p2: 'LONG' };
  }, [fundingP1, fundingP2]);

  const side1 = suggestion?.p1 ?? 'LONG';
  const side2 = suggestion?.p2 ?? 'SHORT';

  const calc = useMemo(() => {
    const val = parseFloat(sizeUSD);
    if (!val || val <= 0 || !price1 || !price2) return null;
    const fallback = 0.0005;
    const limitP1  = platform1 === 'extended'
      ? (side1 === 'LONG' ? (extAsk ?? price1 * (1 - fallback)) : (extBid ?? price1 * (1 + fallback)))
      : (side1 === 'LONG' ? (book.ask ?? price1 * (1 - fallback)) : (book.bid ?? price1 * (1 + fallback)));
    const limitP2  = platform2 === 'extended'
      ? (side2 === 'LONG' ? (extAsk ?? price2 * (1 - fallback)) : (extBid ?? price2 * (1 + fallback)))
      : (side2 === 'LONG' ? (price2 * (1 - fallback)) : (price2 * (1 + fallback)));
    return {
      asset1:    val / price1,
      asset2:    val / price2,
      spreadPct: ((price1 - price2) / price2) * 100,
      limitP1,   limitP2,
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

  const buildOrderParams = (platformId, side, sizeAsset, limitPrice, orderType, reduceOnly = false) => {
    const hlKey = market?.hlKey;
    const meta  = getAssetMeta(hlKey);
    const szDecimals = platformId === 'extended' ? (getExtPrecision(market?.extKey)?.szDecimals ?? 2) : (meta?.szDecimals ?? 6);
    const pxDecimals = platformId === 'extended' ? (getExtPrecision(market?.extKey)?.pxDecimals ?? 2) : (meta?.pxDecimals ?? 2);
    return {
      platformId, hlKey, extKey: market?.extKey, assetIndex: meta?.index ?? 0,
      isBuy: side === 'LONG',
      size: useStepSize && getStepSize(marketId)
        ? Math.floor(sizeAsset / getStepSize(marketId)) * getStepSize(marketId)
        : sizeAsset,
      limitPrice, szDecimals, pxDecimals, orderType, reduceOnly,
    };
  };

  const handlePlaceLeg = async (legNum) => {
    const setter     = legNum === 1 ? setPlacingLeg1 : setPlacingLeg2;
    const platformId = legNum === 1 ? platform1 : platform2;
    const side       = legNum === 1 ? side1 : side2;
    const sizeAsset  = legNum === 1 ? calc?.asset1 : calc?.asset2;
    const limitPx    = legNum === 1 ? calc?.limitP1 : calc?.limitP2;
    const orderType  = legNum === 1 ? orderType1 : orderType2;
    setter(true); setTradeStatus(null);
    try {
      await placeOrder(buildOrderParams(platformId, side, sizeAsset, limitPx, orderType));
      setTradeStatus({ type: 'success', msg: `✅ Ordre ${side} envoyé sur ${PLATFORMS.find(p => p.id === platformId)?.label}` });
    } catch (e) {
      setTradeStatus({ type: 'error', msg: `❌ Erreur : ${e.message}` });
    } finally { setter(false); }
  };

  const handlePlaceBothLegs = async () => {
    setPlacingLeg1(true); setPlacingLeg2(true); setTradeStatus(null);
    try {
      await Promise.all([
        placeOrder(buildOrderParams(platform1, side1, calc?.asset1, calc?.limitP1, orderType1)),
        placeOrder(buildOrderParams(platform2, side2, calc?.asset2, calc?.limitP2, orderType2)),
      ]);
      setTradeStatus({ type: 'success', msg: '✅ Les 2 legs envoyés simultanément !' });
    } catch (e) {
      setTradeStatus({ type: 'error', msg: `❌ Erreur : ${e.message}` });
    } finally { setPlacingLeg1(false); setPlacingLeg2(false); }
  };

  return (
    <div className="px-4 pb-8 flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Position Delta Neutral</h2>
        <div className="flex items-center text-xs text-gray-500">
          <PriceDot fresh={fresh} />
          {lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString('fr-FR')}` : 'Chargement...'}
        </div>
      </div>

      <WalletConfigPanel hlAddress={hlAddress} onHlChange={saveHlAddress} extApiKey={extApiKey} onExtChange={saveExtKey} />

      <FeeConfigPanel fees={fees} onChange={handleFeeChange} />

      <OpenTradeSection
        market={market} platform1={platform1} platform2={platform2} plat1={plat1} plat2={plat2}
        price1={price1} price2={price2} sizeUSD={sizeUSD} setSizeUSD={setSizeUSD}
        side1={side1} side2={side2} calc={calc} fees={fees}
        useStepSize={useStepSize} setUseStepSize={setUseStepSize} getStepSize={getStepSize}
        marketId={marketId} setMarketId={setMarketId} setPlatform1={setPlatform1} setPlatform2={setPlatform2}
        fundingP1={fundingP1} fundingP2={fundingP2} suggestion={suggestion} book={book} extBid={extBid} extAsk={extAsk}
        hlMargin={hlMargin} extMargin={extMargin} getMarginForPlatform={getMarginForPlatform}
        canTradePlatform={canTradePlatform} orderType1={orderType1} setOrderType1={setOrderType1}
        orderType2={orderType2} setOrderType2={setOrderType2} placingLeg1={placingLeg1} placingLeg2={placingLeg2}
        tradeStatus={tradeStatus} handlePlaceLeg={handlePlaceLeg} handlePlaceBothLegs={handlePlaceBothLegs}
        loadedPosition1={loadedPosition1} loadedPosition2={loadedPosition2}
        setLoadedPosition1={setLoadedPosition1} setLoadedPosition2={setLoadedPosition2}
      />

      <OpenTradesPanel address={hlAddress} extApiKey={extApiKey} fees={fees} getPrice={getPrice} />
    </div>
  );
}

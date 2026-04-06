import { useState, useEffect, useMemo } from 'react';
import { PLATFORMS } from '../../hooks/useLivePrices';
import { usePlaceOrder } from '../../hooks/usePlaceOrder';
import { useOpenPositions } from '../../hooks/useDNData';
import { fmt, fmtUSD, computeBE } from '../../utils/dnHelpers';
import DropSection from './DropSection';

const PLAT_BADGE = {
  hyperliquid: 'bg-blue-900/60 text-blue-300 border-blue-700',
  xyz:         'bg-purple-900/60 text-purple-300 border-purple-700',
  hyena:       'bg-orange-900/60 text-orange-300 border-orange-700',
  extended:    'bg-teal-900/60 text-teal-300 border-teal-700',
};

function PositionCard({ pos, isSelected, onSelect, livePrice }) {
  const pnl = livePrice
    ? (pos.side === 'LONG'
        ? (livePrice - pos.entryPx) * pos.szi
        : (pos.entryPx - livePrice) * pos.szi)
    : pos.unrealizedPnl;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-3 flex flex-col gap-1.5 transition-all ${isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900/60 hover:border-gray-500'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PLAT_BADGE[pos.platform] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
            {PLATFORMS.find(p => p.id === pos.platform)?.label ?? pos.platform}
          </span>
          <span className="text-sm font-bold text-white">{pos.label || pos.coin}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${pos.side === 'LONG' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            {pos.side}
          </span>
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

export default function OpenTradesPanel({ hlAddress, hlVaultAddress, extApiKey, fees, getPrice }) {
  const { positions, loading, load } = useOpenPositions(hlAddress, hlVaultAddress, extApiKey);
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
      if (next.has(key)) {
        next.delete(key);
      } else {
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
      const isBuy = pos.side === 'SHORT';
      const price = mode === 'market'
        ? (isBuy ? (lp ?? pos.entryPx) * 1.005 : (lp ?? pos.entryPx) * 0.995)
        : limitPx;
      const ot = closeOType[key] ?? (mode === 'market' ? 'taker' : 'maker');
      await placeOrder({ platformId: pos.platform, extKey: pos.coin, isBuy, size: pos.szi, limitPrice: price, orderType: ot, reduceOnly: true });
      setFeedback(f => ({ ...f, [key]: { ok: true, msg: '✅ Ordre envoyé' } }));
      setTimeout(() => load(), 2500);
    } catch (e) {
      setFeedback(f => ({ ...f, [key]: { ok: false, msg: `❌ ${e.message}` } }));
    } finally {
      setCloseMode(m => ({ ...m, [key]: 'idle' }));
    }
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
                <PositionCard key={posKey(p)} pos={p}
                  isSelected={selectedIds.has(posKey(p))}
                  onSelect={() => toggleSelect(posKey(p))}
                  livePrice={getPrice(p.marketId, p.platform)}
                />
              ))}
            </div>
          </>
        )}

        {selectedPositions.length > 0 && (
          <div className="rounded-xl border border-gray-600 bg-gray-900/60 p-4 flex flex-col gap-4">

            {/* En-tête panel analyse */}
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

            {/* PnL synthèse */}
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

            {/* Cartes fermeture individuelle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedPositions.map(pos => {
                const key    = posKey(pos);
                const state  = closeMode[key] ?? 'idle';
                const fb     = feedback[key];
                const lp     = getPrice(pos.marketId, pos.platform);
                const bePx   = pos === leg1 ? be?.bePx1 : be?.bePx2;
                const isLong = pos.side === 'LONG';
                const pnlBrut = lp
                  ? (isLong ? (lp - pos.entryPx) * pos.szi : (pos.entryPx - lp) * pos.szi)
                  : pos.unrealizedPnl;

                return (
                  <div key={key} className={`rounded-xl border p-4 flex flex-col gap-3 ${isLong ? 'border-green-800 bg-green-900/10' : 'border-red-800 bg-red-900/10'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PLAT_BADGE[pos.platform] ?? ''}`}>
                        {PLATFORMS.find(p => p.id === pos.platform)?.label}
                      </span>
                      <span className="text-sm font-bold text-white">{pos.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isLong ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{pos.side}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { label: 'Size',     val: fmt(pos.szi, 6) },
                        { label: 'Entrée',   val: `$${pos.entryPx?.toFixed(2)}` },
                        { label: 'Live',     val: lp ? `$${lp.toFixed(2)}` : '—' },
                        { label: 'BE calc',  val: bePx ? `$${bePx.toFixed(2)}` : '—' },
                        { label: 'PnL brut', val: fmtUSD(pnlBrut) },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-gray-800 rounded px-2 py-1">
                          <p className="text-gray-500" style={{ fontSize: '10px' }}>{label}</p>
                          <p className="text-gray-200 font-medium text-xs">{val}</p>
                        </div>
                      ))}
                    </div>

                    {fb && (
                      <p className={`text-xs font-medium ${fb.ok ? 'text-green-400' : 'text-red-400'}`}>{fb.msg}</p>
                    )}

                    <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs font-medium">
                      <button onClick={() => setCloseOType(o => ({ ...o, [key]: 'taker' }))}
                        className={`flex-1 py-1.5 transition-colors ${(closeOType[key] ?? 'taker') === 'taker' ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                        ⚡ Market
                      </button>
                      <button onClick={() => setCloseOType(o => ({ ...o, [key]: 'maker' }))}
                        className={`flex-1 py-1.5 transition-colors ${closeOType[key] === 'maker' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                        📋 Limit
                      </button>
                    </div>

                    {(closeOType[key] ?? 'taker') === 'maker' && (
                      <div className="flex items-center gap-2">
                        <input type="number" step="any"
                          value={closePrices[key] ?? ''}
                          onChange={e => setClosePrices(p => ({ ...p, [key]: e.target.value }))}
                          placeholder={lp?.toFixed(2) ?? 'Prix limit'}
                          className="flex-1 px-2 py-1.5 rounded-md bg-gray-800 border border-gray-600 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
                        />
                        {bePx && (
                          <button
                            onClick={() => setClosePrices(p => ({ ...p, [key]: bePx.toFixed(2) }))}
                            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-gray-800 border border-gray-700 whitespace-nowrap"
                          >
                            ↺ BE
                          </button>
                        )}
                      </div>
                    )}

                    {state === 'pending' ? (
                      <p className="text-xs text-yellow-400 animate-pulse text-center py-1">⏳ Envoi en cours…</p>
                    ) : (
                      <button
                        onClick={() => doClose(pos, closeOType[key] ?? 'taker')}
                        className="w-full bg-red-800 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                      >
                        Fermer {pos.side}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Fermeture simultanée */}
            {selectedPositions.length === 2 && (
              <div className="border-t border-gray-700 pt-4 flex flex-col gap-2">
                <p className="text-xs text-gray-400 font-medium">⚡ Fermeture simultanée des 2 legs</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => doCloseBoth('taker')}
                    className="bg-red-800 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors">
                    🔴 Market — les 2 simultanément
                  </button>
                  <button onClick={() => doCloseBoth('maker')}
                    className="bg-orange-800 hover:bg-orange-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors">
                    📋 Limit BE — les 2 simultanément
                  </button>
                </div>
                {be && (
                  <p className={`text-xs text-center font-medium ${be.pnlNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    PnL net estimé : {fmtUSD(be.pnlNet)}
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

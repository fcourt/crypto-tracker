import { fmt, fmtUSD, fmtPct } from '../../utils/dnHelpers';
import DropSection from './DropSection';
import { useEffect } from 'react';
import { PLATFORMS }         from '../../hooks/useLivePrices';
import { useMarketFilter }   from '../../hooks/useMarketFilter';

function LegCard({
  side, platform, price, limitPrice, leverage, sizeUSD, sizeAsset, marginAvailable,
  fundingRate, isSuggested, feesMaker, feesTaker, useStepSize, stepSize,
  onPlaceOrder, isPlacingOrder, canTrade, orderType, onOrderTypeChange,
}) {
  const isLong      = side === 'LONG';
  const fundingNet  = fundingRate != null ? (isLong ? -fundingRate : fundingRate) : null;
  const receivePay  = fundingNet == null ? null : fundingNet >= 0 ? 'reçoit' : 'paie';
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
            <span className={`font-bold text-sm ${fundingRate == null ? 'text-gray-500' : fundingRate >= 0 ? 'text-orange-400' : 'text-green-400'}`}>
              {fmtPct(fundingRate)}
            </span>
            <span className="text-gray-500 text-xs ml-1">
              ({fmtPct(fundingRate != null ? fundingRate * 24 * 365 : null)} /an)
            </span>
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
        <button onClick={() => onOrderTypeChange('taker')} className={`flex-1 py-2 transition-colors ${orderType === 'taker' ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
          ⚡ Market — Taker
        </button>
        <button onClick={() => onOrderTypeChange('maker')} className={`flex-1 py-2 transition-colors ${orderType === 'maker' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
          📋 Limit — Maker
        </button>
      </div>

      {sizeDisplay && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(sizeDisplay.toFixed(6))}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
          >
            📋 Copier size : {fmt(sizeDisplay, 6)}
          </button>
          {canTrade ? (
            <button
              onClick={onPlaceOrder}
              disabled={isPlacingOrder || !limitPrice || !sizeDisplay}
              className={`w-full text-white text-xs font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${isLong ? 'bg-green-700 hover:bg-green-600 disabled:opacity-50' : 'bg-red-700 hover:bg-red-600 disabled:opacity-50'}`}
            >
              {isPlacingOrder
                ? <><span className="animate-spin">⟳</span> Envoi...</>
                : <>{isLong ? '🟢' : '🔴'} Ouvrir {side} sur {platform?.label}</>}
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

export default function OpenTradeSection({
  markets, platform1, platform2, plat1, plat2, price1, price2,
  sizeUSD, setSizeUSD, side1, side2, calc, fees,
  useStepSize, setUseStepSize, getStepSize, marketId, setMarketId,
  setPlatform1, setPlatform2, fundingP1, fundingP2, suggestion, book, extBid, extAsk,
  getMarginForPlatform, canTradePlatform,
  orderType1, setOrderType1, orderType2, setOrderType2,
  placingLeg1, placingLeg2, tradeStatus,
  handlePlaceLeg, handlePlaceBothLegs,
  loadedPosition1, loadedPosition2, setLoadedPosition1, setLoadedPosition2,
}) {

  const { filteredMarkets, loading, errors, isIntersection, counts } =
    useMarketFilter(platform1, platform2, markets);

  // Auto-reset si le marché actuel disparaît de la liste filtrée
  useEffect(() => {
  if (!loading && filteredMarkets.length > 0 && marketId !== '') {
    if (!filteredMarkets.find(m => m.id === marketId)) {
      setMarketId('');   // ← reset vers vide plutôt que forcer le premier
    }
  }
}, [filteredMarkets, loading, marketId, setMarketId]);
  
  return (
    <DropSection title="📈 Ouvrir un trade Delta Neutral" defaultOpen={true}>
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Sélecteurs */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">

  {/* Plateforme 1 */}
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

  {/* Plateforme 2 */}
  <div className="flex flex-col gap-1">
    <label className="text-xs text-gray-500">Plateforme 2</label>
    <select
      value={platform2}
      onChange={e => setPlatform2(e.target.value)}
      className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
    >
      <option value="">— Aucune —</option>
      
      {PLATFORMS.filter(p => p.id !== platform1).map(p => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
    </select>
  </div>

  {/* Marché */}
  <div className="flex flex-col gap-1">
    <label className="text-xs text-gray-500 flex items-center gap-2">
      Marché
      {loading && (
        <span className="text-gray-600 animate-pulse text-xs">chargement…</span>
      )}
      {!loading && isIntersection && (
        <span className="text-blue-400 text-xs">
          {filteredMarkets.length} communs ({counts[platform1]} ∩ {counts[platform2]})
        </span>
      )}
      {Object.keys(errors).length > 0 && (
        <span className="text-orange-400 text-xs" title={JSON.stringify(errors)}>
          ⚠️ {Object.keys(errors).join(', ')} indisponible
        </span>
      )}
    </label>
    <select
      value={marketId}
      onChange={e => setMarketId(e.target.value)}
      disabled={loading && filteredMarkets.length === 0}
      className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
    >
      {/* Option vide toujours visible */}
      <option value="">— Sélectionner —</option>
      
      {['Crypto', 'Indices', 'Commodités', 'Equities'].map(cat => {
        const catMarkets = filteredMarkets.filter(m => m.category === cat);
        if (catMarkets.length === 0) return null;
        return (
          <optgroup key={cat} label={`${cat} (${catMarkets.length})`}>
            {catMarkets.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  </div>

  {/* Taille */}
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
        {/* Direction optimale + toggle step size */}
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
                    Diff : {fmtPct(Math.abs(fundingP1 - fundingP2))} /h
                    ({fmtPct(Math.abs(fundingP1 - fundingP2) * 24 * 365)} /an)
                  </span>
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

        {/* Spread */}
        {calc?.spreadPct != null && (
          <div className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between ${Math.abs(calc.spreadPct) > 0.1 ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-gray-900 border border-gray-700'}`}>
            <span className="text-gray-400">Écart de prix {plat1?.label} / {plat2?.label}</span>
            <span className={`font-bold ${Math.abs(calc.spreadPct) > 0.1 ? 'text-yellow-400' : 'text-white'}`}>
              {calc.spreadPct > 0 ? '+' : ''}{calc.spreadPct.toFixed(4)}%
            </span>
          </div>
        )}

        {/* LegCards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LegCard
            side={side1} platform={plat1} price={price1} limitPrice={calc?.limitP1} leverage={calc?.leverage1}
            sizeUSD={parseFloat(sizeUSD) || null} sizeAsset={calc?.asset1}
            marginAvailable={getMarginForPlatform(platform1)} fundingRate={fundingP1}
            isSuggested={!!suggestion} feesMaker={fees[platform1]?.maker ?? 0} feesTaker={fees[platform1]?.taker ?? 0}
            useStepSize={useStepSize} stepSize={getStepSize(marketId)}
            orderType={orderType1} onOrderTypeChange={setOrderType1}
            canTrade={canTradePlatform(platform1)} onPlaceOrder={() => handlePlaceLeg(1)} isPlacingOrder={placingLeg1}
          />
          <LegCard
            side={side2} platform={plat2} price={price2} limitPrice={calc?.limitP2} leverage={calc?.leverage2}
            sizeUSD={parseFloat(sizeUSD) || null} sizeAsset={calc?.asset2}
            marginAvailable={getMarginForPlatform(platform2)} fundingRate={fundingP2}
            isSuggested={!!suggestion} feesMaker={fees[platform2]?.maker ?? 0} feesTaker={fees[platform2]?.taker ?? 0}
            useStepSize={useStepSize} stepSize={getStepSize(marketId)}
            orderType={orderType2} onOrderTypeChange={setOrderType2}
            canTrade={canTradePlatform(platform2)} onPlaceOrder={() => handlePlaceLeg(2)} isPlacingOrder={placingLeg2}
          />
        </div>

        {/* Feedback */}
        {tradeStatus && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium text-center ${tradeStatus.type === 'success' ? 'bg-green-900/40 border border-green-700 text-green-300' : 'bg-red-900/40 border border-red-700 text-red-300'}`}>
            {tradeStatus.msg}
          </div>
        )}

        {/* Bouton 2 legs */}
        {calc && !loadedPosition1 && !loadedPosition2 && (
          <button
            onClick={handlePlaceBothLegs}
            disabled={placingLeg1 || placingLeg2 || !calc.limitP1 || !calc.limitP2}
            className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
          >
            {(placingLeg1 || placingLeg2)
              ? <><span className="animate-spin">⟳</span> Envoi des 2 legs...</>
              : <>🚀 Ouvrir les 2 legs simultanément — {plat1?.label} + {plat2?.label}</>}
          </button>
        )}

        {/* 1 seul leg manquant */}
        {calc && (loadedPosition1 || loadedPosition2) && !(loadedPosition1 && loadedPosition2) && (
          <div className="rounded-xl border border-yellow-700 bg-yellow-900/20 px-4 py-3 flex flex-col gap-2">
            <p className="text-xs text-yellow-400 font-medium">
              ⚡ Position {(loadedPosition1 ?? loadedPosition2).side} déjà ouverte sur {PLATFORMS.find(p => p.id === (loadedPosition1 ?? loadedPosition2).platform)?.label} — ouverture du leg manquant uniquement
            </p>
            <button
              onClick={() => handlePlaceLeg(loadedPosition1 ? 2 : 1)}
              disabled={placingLeg1 || placingLeg2}
              className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
            >
              {(placingLeg1 || placingLeg2) ? <><span className="animate-spin">⟳</span> Envoi...</> : <>🚀 Ouvrir le leg manquant</>}
            </button>
            <button
              onClick={() => { setLoadedPosition1(null); setLoadedPosition2(null); }}
              className="text-xs text-gray-500 hover:text-gray-300 text-center transition-colors"
            >
              ✕ Annuler (ouvrir les 2 legs)
            </button>
          </div>
        )}
      </div>
    </DropSection>
  );
}

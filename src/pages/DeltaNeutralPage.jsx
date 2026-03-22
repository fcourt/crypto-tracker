import { useState, useMemo } from 'react';
import { useLivePrices, MARKETS, PLATFORMS } from '../hooks/useLivePrices';
import { useFundingRates } from '../hooks/useFundingRates';

const fmt  = (n, d = 2) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n);
const fmtP = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(4) + '%';

function PriceDot({ fresh }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${fresh ? 'bg-green-400' : 'bg-yellow-500'}`} />
  );
}

function LegCard({ side, platform, price, leverage, sizeUSD, sizeAsset, marginRequired, fundingRate, suggestion }) {
  const isSuggested = suggestion === side;
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
      side === 'LONG'
        ? 'border-green-700 bg-green-900/20'
        : 'border-red-700 bg-red-900/20'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            side === 'LONG' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
          }`}>
            {side}
          </span>
          <span className="text-sm font-bold text-white">{platform?.label}</span>
        </div>
        {isSuggested && (
          <span className="text-xs text-yellow-400 font-medium">⭐ Suggéré</span>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg px-3 py-2">
        <p className="text-gray-500 text-xs mb-0.5">Prix live</p>
        <p className="text-white font-bold text-lg">
          {price ? `$${fmt(price, price > 100 ? 2 : 4)}` : '—'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Size (asset)</p>
          <p className="text-white font-bold">{sizeAsset ? fmt(sizeAsset, 6) : '—'}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Notionnel</p>
          <p className="text-white font-bold">{sizeUSD ? `$${fmt(sizeUSD)}` : '—'}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Levier</p>
          <p className="text-blue-300 font-bold">{leverage}x</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Marge requise</p>
          <p className="text-yellow-300 font-bold">{marginRequired ? `$${fmt(marginRequired)}` : '—'}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-3 py-2 col-span-2">
          <p className="text-gray-500 text-xs">Funding rate (1h)</p>
          <p className={`font-bold ${fundingRate == null ? 'text-gray-500' : fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtP(fundingRate)}
            {fundingRate != null && (
              <span className="text-gray-500 font-normal ml-1 text-xs">
                ({fmtP(fundingRate * 24 * 365)} /an)
              </span>
            )}
          </p>
        </div>
      </div>

      {sizeAsset && (
        <button
          onClick={() => navigator.clipboard.writeText(sizeAsset.toFixed(6))}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
        >
          📋 Copier la size : {fmt(sizeAsset, 6)}
        </button>
      )}
    </div>
  );
}

export default function DeltaNeutralPage() {
  const [marketId,  setMarketId]  = useState('BTC');
  const [platform1, setPlatform1] = useState('hyperliquid');
  const [platform2, setPlatform2] = useState('extended');
  const [sizeMode,  setSizeMode]  = useState('usd');
  const [sizeValue, setSizeValue] = useState('');
  const [leverage1, setLeverage1] = useState(5);
  const [leverage2, setLeverage2] = useState(5);
  const [dirP1,     setDirP1]     = useState('LONG');

  const { getPrice, lastUpdate } = useLivePrices(3000);
  const fundingRates = useFundingRates(marketId, platform1, platform2);

  const price1 = getPrice(marketId, platform1);
  const price2 = getPrice(marketId, platform2);
  const plat1  = PLATFORMS.find(p => p.id === platform1);
  const plat2  = PLATFORMS.find(p => p.id === platform2);
  const dirP2  = dirP1 === 'LONG' ? 'SHORT' : 'LONG';

  const suggestion = useMemo(() => {
    const r1 = fundingRates.p1;
    const r2 = fundingRates.p2;
    if (r1 == null || r2 == null) return null;
    return r1 <= r2 ? 'LONG_P1' : 'LONG_P2';
  }, [fundingRates]);

  const { sizeUSD, sizeAsset1, sizeAsset2, margin1, margin2, spreadPct } = useMemo(() => {
    const val = parseFloat(sizeValue);
    if (!val || val <= 0 || !price1 || !price2) return {};
    const usd    = sizeMode === 'usd' ? val : val * ((price1 + price2) / 2);
    const asset1 = usd / price1;
    const asset2 = usd / price2;
    const spread = ((price1 - price2) / price2) * 100;
    return {
      sizeUSD:    usd,
      sizeAsset1: asset1,
      sizeAsset2: asset2,
      margin1:    usd / leverage1,
      margin2:    usd / leverage2,
      spreadPct:  spread,
    };
  }, [sizeValue, sizeMode, price1, price2, leverage1, leverage2]);

  const fresh = lastUpdate && (Date.now() - lastUpdate.getTime()) < 6000;

  return (
    <div className="px-4 pb-8 flex flex-col gap-4 pt-2">

      {/* Titre + freshness */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
          Position Delta Neutral
        </h2>
        <div className="flex items-center text-xs text-gray-500">
          <PriceDot fresh={fresh} />
          {lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString('fr-FR')}` : 'Chargement...'}
        </div>
      </div>

      {/* Config */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-4">

        {/* Ligne 1 : Marché + Plateformes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Marché */}
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
              {PLATFORMS.filter(p => p.id !== platform1).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ligne 2 : Size + Leviers + Direction */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {/* Size */}
          <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
            <label className="text-xs text-gray-500">Size</label>
            <div className="flex gap-1">
              <button
                onClick={() => setSizeMode('usd')}
                className={`text-xs px-2.5 py-2 rounded-l-lg border transition-colors ${
                  sizeMode === 'usd'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-600 text-gray-400'
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setSizeMode('asset')}
                className={`text-xs px-2.5 py-2 rounded-r-lg border transition-colors ${
                  sizeMode === 'asset'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-600 text-gray-400'
                }`}
              >
                {MARKETS.find(m => m.id === marketId)?.label}
              </button>
            </div>
            <input
              type="number"
              value={sizeValue}
              onChange={e => setSizeValue(e.target.value)}
              placeholder={sizeMode === 'usd' ? '1000' : '0.01'}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Levier P1 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Levier P1</label>
            <input
              type="number"
              min="1" max="50"
              value={leverage1}
              onChange={e => setLeverage1(Number(e.target.value))}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Levier P2 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Levier P2</label>
            <input
              type="number"
              min="1" max="50"
              value={leverage2}
              onChange={e => setLeverage2(Number(e.target.value))}
              className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Direction P1 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Direction P1</label>
            <div className="flex gap-1">
              <button
                onClick={() => setDirP1('LONG')}
                className={`flex-1 text-xs py-2 rounded-l-lg border transition-colors ${
                  dirP1 === 'LONG'
                    ? 'bg-green-700 border-green-600 text-white'
                    : 'bg-gray-900 border-gray-600 text-gray-400'
                }`}
              >
                Long
              </button>
              <button
                onClick={() => setDirP1('SHORT')}
                className={`flex-1 text-xs py-2 rounded-r-lg border transition-colors ${
                  dirP1 === 'SHORT'
                    ? 'bg-red-700 border-red-600 text-white'
                    : 'bg-gray-900 border-gray-600 text-gray-400'
                }`}
              >
                Short
              </button>
            </div>
            <p className="text-gray-600 text-xs">P2 sera {dirP2}</p>
          </div>
        </div>

        {/* Spread */}
        {spreadPct != null && (
          <div className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between ${
            Math.abs(spreadPct) > 0.1
              ? 'bg-yellow-900/30 border border-yellow-700'
              : 'bg-gray-900 border border-gray-700'
          }`}>
            <span className="text-gray-400">
              Écart de prix entre {plat1?.label} et {plat2?.label}
            </span>
            <span className={`font-bold ${Math.abs(spreadPct) > 0.1 ? 'text-yellow-400' : 'text-white'}`}>
              {spreadPct > 0 ? '+' : ''}{spreadPct.toFixed(4)}%
            </span>
          </div>
        )}

        {/* Marge totale */}
        {margin1 && margin2 && (
          <div className="rounded-lg px-3 py-2 bg-blue-900/20 border border-blue-700 text-xs flex items-center justify-between">
            <span className="text-gray-400">Marge totale requise</span>
            <span className="font-bold text-blue-300">${fmt(margin1 + margin2)}</span>
          </div>
        )}
      </div>

      {/* Les 2 LegCards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LegCard
          side={dirP1}
          platform={plat1}
          price={price1}
          leverage={leverage1}
          sizeUSD={sizeUSD}
          sizeAsset={sizeAsset1}
          marginRequired={margin1}
          fundingRate={fundingRates.p1}
          suggestion={suggestion === 'LONG_P1' ? dirP1 : null}
        />
        <LegCard
          side={dirP2}
          platform={plat2}
          price={price2}
          leverage={leverage2}
          sizeUSD={sizeUSD}
          sizeAsset={sizeAsset2}
          marginRequired={margin2}
          fundingRate={fundingRates.p2}
          suggestion={suggestion === 'LONG_P2' ? dirP2 : null}
        />
      </div>

    </div>
  );
}

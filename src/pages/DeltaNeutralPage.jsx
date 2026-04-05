import { useState, useEffect, useMemo } from 'react';  // ← useEffect ajouté
import { useLivePrices, MARKETS, PLATFORMS } from '../hooks/useLivePrices';
import { useFundingRates } from '../hooks/useFundingRates';
import { getExtendedApiKeys, saveExtendedApiKey } from '../hooks/useExtendedData';
import { usePlaceOrder } from '../hooks/usePlaceOrder';
import { useHLMeta } from '../hooks/useHLMeta';
import { useHLMargin, useExtMargin, useOrderBook } from '../hooks/useDNData';
import { loadFees, saveFees, minLeverageFor, roundToHLPrice } from '../utils/dnHelpers';
import WalletConfigPanel from '../components/delta-neutral/WalletConfigPanel';
import FeeConfigPanel    from '../components/delta-neutral/FeeConfigPanel';
import OpenTradeSection  from '../components/delta-neutral/OpenTradeSection';
import OpenTradesPanel   from '../components/delta-neutral/OpenTradesPanel';


function PriceDot({ fresh }) {
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${fresh ? 'bg-green-400' : 'bg-yellow-500'}`} />;
}

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

  // ── Adresses ──────────────────────────────────────────────────────────────
  const [hlAddress,      setHlAddress]      = useState(() => localStorage.getItem('hl_address')?.trim()       || '');
  const [hlVaultAddress, setHlVaultAddress] = useState(() => localStorage.getItem('hl_vault_address')?.trim() || '');
  const [extApiKey,      setExtApiKey]      = useState(() => localStorage.getItem('ext_api_key') || getExtendedApiKeys()[0]?.apiKey || '');

  // Hydratation au mount — garantit la synchro si le state rate le localStorage
  useEffect(() => {
    const vault = localStorage.getItem('hl_vault_address')?.trim() || '';
    if (vault !== hlVaultAddress) setHlVaultAddress(vault);
  }, []);

  // ── Fonctions save ────────────────────────────────────────────────────────
  const saveHlAddress = (v) => {
    const val = v.trim();
    setHlAddress(val);
    localStorage.setItem('hl_address', val);
  };
  const saveHlVaultAddress = (v) => {
    const val = v.trim();
    setHlVaultAddress(val);
    localStorage.setItem('hl_vault_address', val);
  };
  const saveExtKey = (key) => {
    setExtApiKey(key);
    localStorage.setItem('ext_api_key', key);
    saveExtendedApiKey(key, 'Delta Neutral');
  };

  // ── Hooks trading ─────────────────────────────────────────────────────────
  const { placeOrder, canTradeHL, canTradeExt } = usePlaceOrder();

  // ── Marges — useHLMargin reçoit les 2 adresses et décide lui-même ─────────
  const { margin: hlMargin, effectiveAddress: hlMarginAddress } = useHLMargin(hlAddress, hlVaultAddress);
  const extMargin = useExtMargin(extApiKey);

  // ── Funding & prix ────────────────────────────────────────────────────────
  const { p1: fundingP1, p2: fundingP2, extBid, extAsk } = useFundingRates(marketId, platform1, platform2, extApiKey);

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
    const limitP1 = platform1 === 'extended'
      ? (side1 === 'LONG' ? (extAsk ?? price1 * (1 - fallback)) : (extBid ?? price1 * (1 + fallback)))
      : (side1 === 'LONG' ? (book.ask ?? price1 * (1 - fallback)) : (book.bid ?? price1 * (1 + fallback)));
    const limitP2 = platform2 === 'extended'
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

  const handleFeeChange = (platformId, type, value) => {
    const updated = { ...fees, [platformId]: { ...fees[platformId], [type]: value } };
    setFees(updated);
    saveFees(updated);
  };

  /*const buildOrderParams = (platformId, side, sizeAsset, limitPrice, orderType, reduceOnly = false) => {
    const hlKey      = market?.hlKey;
    const meta       = getAssetMeta(hlKey);
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
  };*/

  // buildOrderParams reste ICI dans le composant
const buildOrderParams = (platformId, side, sizeAsset, limitPrice, orderType, reduceOnly = false) => {
  const hlKey = market?.hlKey;
  const meta  = getAssetMeta(hlKey);

  // Avertissement non bloquant — meta peut être null si le cache charge encore
  if (platformId !== 'extended' && !meta) {
    console.warn(`[buildOrderParams] Meta non trouvée pour "${hlKey}" — l'index sera 0`);
  }

  const szDecimals = platformId === 'extended'
    ? (getExtPrecision(market?.extKey)?.szDecimals ?? 2)
    : (meta?.szDecimals ?? 2);

  const pxDecimals = platformId === 'extended'
    ? (getExtPrecision(market?.extKey)?.pxDecimals ?? 2)
    : (meta?.pxDecimals ?? 2);

  // Prix arrondi à 5 chiffres significatifs pour HL
  const roundedPrice = platformId !== 'extended'
    ? roundToHLPrice(limitPrice)
    : limitPrice;

  // Size arrondie proprement via toFixed (évite les erreurs float IEEE 754)
  const rawSize     = useStepSize && getStepSize(marketId)
    ? Math.floor(sizeAsset / getStepSize(marketId)) * getStepSize(marketId)
    : sizeAsset;
  const roundedSize = parseFloat(rawSize.toFixed(szDecimals));

  console.log(`[Order] ${hlKey} | index: ${meta?.index ?? 0} | price: ${limitPrice} → ${roundedPrice} | size: ${roundedSize} (szDec: ${szDecimals})`);

  return {
    platformId,
    hlKey,
    extKey:     market?.extKey,
    assetIndex: meta?.index ?? 0,  // ← 0 seulement si meta vraiment absente (ne devrait plus arriver)
    isBuy:      side === 'LONG',
    size:       roundedSize,
    limitPrice: roundedPrice,
    szDecimals,
    pxDecimals,
    orderType,
    reduceOnly,
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

  const fresh = lastUpdate && (Date.now() - lastUpdate.getTime()) < 6000;

  return (
    <div className="px-4 pb-8 flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Position Delta Neutral</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {/* Indicateur adresse marge HL */}
          {hlMarginAddress && (
            <span className={`font-mono ${hlMarginAddress === hlVaultAddress && hlVaultAddress ? 'text-green-400' : 'text-yellow-500'}`}>
              {hlMarginAddress === hlVaultAddress && hlVaultAddress ? '✓ sous-compte' : '⚠ compte principal'}
              {' '}{hlMarginAddress.slice(0, 6)}…{hlMarginAddress.slice(-4)}
            </span>
          )}
          <PriceDot fresh={fresh} />
          {lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString('fr-FR')}` : 'Chargement...'}
        </div>
      </div>

      <WalletConfigPanel
        hlAddress={hlAddress}           onHlChange={saveHlAddress}
        hlVaultAddress={hlVaultAddress} onVaultChange={saveHlVaultAddress}
        extApiKey={extApiKey}           onExtChange={saveExtKey}
      />

      <FeeConfigPanel fees={fees} onChange={handleFeeChange} />

      <OpenTradeSection
        market={market} platform1={platform1} platform2={platform2} plat1={plat1} plat2={plat2}
        price1={price1} price2={price2} sizeUSD={sizeUSD} setSizeUSD={setSizeUSD}
        side1={side1} side2={side2} calc={calc} fees={fees}
        useStepSize={useStepSize} setUseStepSize={setUseStepSize} getStepSize={getStepSize}
        marketId={marketId} setMarketId={setMarketId} setPlatform1={setPlatform1} setPlatform2={setPlatform2}
        fundingP1={fundingP1} fundingP2={fundingP2} suggestion={suggestion} book={book} extBid={extBid} extAsk={extAsk}
        getMarginForPlatform={getMarginForPlatform} canTradePlatform={canTradePlatform}
        orderType1={orderType1} setOrderType1={setOrderType1}
        orderType2={orderType2} setOrderType2={setOrderType2}
        placingLeg1={placingLeg1} placingLeg2={placingLeg2}
        tradeStatus={tradeStatus} handlePlaceLeg={handlePlaceLeg} handlePlaceBothLegs={handlePlaceBothLegs}
        loadedPosition1={loadedPosition1} loadedPosition2={loadedPosition2}
        setLoadedPosition1={setLoadedPosition1} setLoadedPosition2={setLoadedPosition2}
      />

      <OpenTradesPanel
        address={hlVaultAddress || hlAddress}
        extApiKey={extApiKey} fees={fees} getPrice={getPrice}
      />
    </div>
  );
}

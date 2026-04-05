export const HL_API = 'https://api.hyperliquid.xyz/info';
export const LEVERAGE_STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 50];
export const DEFAULT_FEES = {
  hyperliquid: { maker: 0.0001,  taker: 0.00035 },
  xyz:         { maker: 0.00003, taker: 0.00009 },
  hyena:       { maker: 0.0002,  taker: 0.0005  },
  extended:    { maker: 0.0002,  taker: 0.0005  },
};
export const FEES_STORAGE_KEY = 'dn_platform_fees';

export const fmt    = (n, d = 2) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n);
export const fmtUSD = (n) => n == null ? '—' : (n < 0 ? '-$' : '$') + fmt(Math.abs(n), 2);
export const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(4) + '%';

export function minLeverageFor(notional, margin) {
  if (!margin || margin <= 0 || !notional) return null;
  const raw = notional / margin;
  return LEVERAGE_STEPS.find(l => l >= raw) ?? LEVERAGE_STEPS[LEVERAGE_STEPS.length - 1];
}

export function loadFees() {
  try { return { ...DEFAULT_FEES, ...JSON.parse(localStorage.getItem(FEES_STORAGE_KEY) || '{}') }; }
  catch { return DEFAULT_FEES; }
}

export function saveFees(fees) {
  localStorage.setItem(FEES_STORAGE_KEY, JSON.stringify(fees));
}

export function rawPricePnl(leg1, leg2, px1, px2) {
  if (!leg1 || !leg2 || !px1 || !px2) return 0;
  const pnl1 = leg1.side === 'LONG' ? (px1 - leg1.entryPx) * leg1.szi : (leg1.entryPx - px1) * leg1.szi;
  const pnl2 = leg2.side === 'LONG' ? (px2 - leg2.entryPx) * leg2.szi : (leg2.entryPx - px2) * leg2.szi;
  return pnl1 + pnl2;
}

export function computeBE({ leg1, leg2, fees, includeFees, includeFunding, currentPx1, currentPx2 }) {
  if (!leg1 || !leg2) return null;

  const entryPx1   = leg1.entryPx ?? 0;
  const entryPx2   = leg2.entryPx ?? 0;
  const size1      = leg1.szi ?? 0;
  const size2      = leg2.szi ?? 0;
  const exitPx1Est = currentPx1 ?? entryPx1;
  const exitPx2Est = currentPx2 ?? entryPx2;

  const fundingPnl = includeFunding
    ? ((leg1.unrealizedPnl ?? 0) + (leg2.unrealizedPnl ?? 0) - rawPricePnl(leg1, leg2, exitPx1Est, exitPx2Est))
    : 0;

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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MARKETS } from './useLivePrices';
import { HL_API } from '../utils/dnHelpers';

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchHLPositions(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return [];
  try {
    const res   = await fetch(HL_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'clearinghouseState', user: address.trim() }),
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

export function useHLMargin(address) {
  const [margin, setMargin] = useState(null);

  useEffect(() => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address)) {
      setMargin(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res   = await fetch(HL_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'clearinghouseState', user: address }),
        });
        const state = await res.json();
        const val =
          parseFloat(state?.crossMarginSummary?.accountValue    || 0) -
          parseFloat(state?.crossMarginSummary?.totalMarginUsed || 0);
        if (!cancelled) setMargin(val);
      } catch { if (!cancelled) setMargin(null); }
    };
    run();
    const t = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [address]);

  return { margin, effectiveAddress: address };
}
/*
async function fetchMarginForAddress(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return null;
  try {
    const res   = await fetch(HL_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'clearinghouseState', user: address.trim() }),
    });
    const state = await res.json();
    // withdrawable = marge disponible fiable (cross + isolated, tous modes)
    const w = parseFloat(state?.withdrawable ?? 0);
    return isNaN(w) ? null : w;
  } catch { return null; }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useHLMargin(mainAddress, vaultAddress) {
  const [mainMargin,  setMainMargin]  = useState(null);
  const [vaultMargin, setVaultMargin] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const [m, v] = await Promise.all([
        fetchMarginForAddress(mainAddress),
        fetchMarginForAddress(vaultAddress),
      ]);
      if (!cancelled) { setMainMargin(m); setVaultMargin(v); }
    };
    run();
    const t = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [mainAddress, vaultAddress]);

  const effectiveAddress = useMemo(() => {
    if (vaultAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(vaultAddress.trim()))
      return vaultAddress.trim();
    if (mainAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(mainAddress.trim()))
      return mainAddress.trim();
    return null;
  }, [mainAddress, vaultAddress]);

  return { mainMargin, vaultMargin, effectiveAddress };
}
*/

export function useExtMargin(apiKey) {
  const [margin, setMargin] = useState(null);
  useEffect(() => {
    if (!apiKey?.trim()) return;
    const run = async () => {
      try {
        const res  = await fetch(
          `/api/extended?endpoint=${encodeURIComponent('/user/balance')}`,
          { headers: { 'X-Api-Key': apiKey } }
        );
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

export function useOrderBook(hlKey) {
  const [book, setBook] = useState({ bid: null, ask: null });
  useEffect(() => {
    if (!hlKey) return;
    const run = async () => {
      try {
        const res  = await fetch(HL_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'l2Book', coin: hlKey }),
        });
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

export function useOpenPositions(mainAddress, vaultAddress, extApiKey) {
  const [positions, setPositions] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hlMain, hlVault, extPos] = await Promise.all([
        fetchHLPositions(mainAddress),
        fetchHLPositions(vaultAddress),
        fetchExtPositions(extApiKey),
      ]);
      // Déduplique si même coin sur même plateforme (cas vault = sous-compte du main)
      const seen   = new Set();
      const hlUniq = [...hlMain, ...hlVault].filter(p => {
        const key = `${p.platform}-${p.coin}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setPositions([...hlUniq, ...extPos]);
    } catch (e) { console.warn('useOpenPositions error:', e.message); }
    finally { setLoading(false); }
  }, [mainAddress, vaultAddress, extApiKey]);

  return { positions, loading, load };
}

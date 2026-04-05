import { useState, useEffect, useCallback, useMemo } from 'react'; // ← useMemo ajouté
import { MARKETS } from './useLivePrices';
import { HL_API } from '../utils/dnHelpers';

// ─── Fetchers ─────────────────────────────────────────────────────────────────

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

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useHLMargin(mainAddress, vaultAddress) {
  const [margin, setMargin] = useState(null);

  // Résout l'adresse effective : sous-compte en priorité, sinon compte principal
  const effectiveAddress = useMemo(() => {
    const vault = vaultAddress?.trim();
    const main  = mainAddress?.trim();
    if (vault && /^0x[0-9a-fA-F]{40}$/.test(vault)) return vault;
    if (main  && /^0x[0-9a-fA-F]{40}$/.test(main))  return main;
    return null;
  }, [mainAddress, vaultAddress]);

  useEffect(() => {
    if (!effectiveAddress) { setMargin(null); return; }
    const run = async () => {
      try {
        const res   = await fetch(HL_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: effectiveAddress }),
        });
        const state = await res.json();
        setMargin(
          parseFloat(state?.crossMarginSummary?.accountValue    || 0) -
          parseFloat(state?.crossMarginSummary?.totalMarginUsed || 0)
        );
      } catch { setMargin(null); }
    };
    run();
    const t = setInterval(run, 15000);
    return () => clearInterval(t);
  }, [effectiveAddress]);

  return { margin, effectiveAddress };
}

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
    run();
    const t = setInterval(run, 5000);
    return () => clearInterval(t);
  }, [hlKey]);
  return book;
}

export function useOpenPositions(address, extApiKey) {
  const [positions, setPositions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hlPos, extPos] = await Promise.all([
        fetchHLPositions(address),
        fetchExtPositions(extApiKey),
      ]);
      setPositions([...hlPos, ...extPos]);
    } catch (e) { console.warn('useOpenPositions error:', e.message); }
    finally { setLoading(false); }
  }, [address, extApiKey]);
  return { positions, loading, load };
}

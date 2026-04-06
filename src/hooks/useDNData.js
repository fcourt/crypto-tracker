import { useState, useEffect, useCallback } from 'react';
import { MARKETS } from './useLivePrices';
import { HL_API } from '../utils/dnHelpers';

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

export function useHLMargin(mainAddress, vaultAddress) {
  const [margin,           setMargin]           = useState(null);
  const [effectiveAddress, setEffectiveAddress] = useState(null);

  useEffect(() => {
    const main  = mainAddress?.trim();
    const vault = vaultAddress?.trim();
    const validMain  = !!(main  && /^0x[0-9a-fA-F]{40}$/i.test(main));
    const validVault = !!(vault && /^0x[0-9a-fA-F]{40}$/i.test(vault));

    if (!validMain && !validVault) { setMargin(null); setEffectiveAddress(null); return; }
    setEffectiveAddress(validVault ? vault : main);

    let cancelled = false;
    const run = async () => {
      try {
        if (validVault && validMain) {
          const r1   = await fetch(HL_API, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ type: 'subAccounts', user: main.toLowerCase() }),
          });
          const data = await r1.json();
          console.log('[HL margin] subAccounts raw:', JSON.stringify(data));
          console.log('[HL margin] looking for vault:', vault.toLowerCase());
          if (Array.isArray(data) && data.length > 0) {
            const sub = data.find(s => s.subAccountUser?.toLowerCase() === vault.toLowerCase());
            if (sub) {
              const cs       = sub.clearinghouseState;
              const perpFree = parseFloat(cs?.marginSummary?.accountValue    || 0)
                 - parseFloat(cs?.marginSummary?.totalMarginUsed || 0);

              // Spot USDC disponible (fonds non encore transferes en perp)
              const spotUsdc = (sub.spotState?.balances || []).find(b => b.coin === 'USDC');
              const spotFree = parseFloat(spotUsdc?.total || 0);

              const val = perpFree > 0 ? perpFree : spotFree;
              console.log('[HL margin] sub found =>', { perpFree, spotFree, val });
              if (!cancelled) setMargin(val);
              return;
            }            
            console.log('[HL margin] vault not found in subAccounts list');
          } else {
            console.log('[HL margin] subAccounts null/empty - hlAddress is not master');
          }
        }

        const addr  = (validVault ? vault : main).toLowerCase();
        console.log('[HL margin] fallback clearinghouseState for:', addr);
        const r2    = await fetch(HL_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'clearinghouseState', user: addr }),
        });
        const state = await r2.json();
        const cross = parseFloat(state?.crossMarginSummary?.accountValue    || 0)
                    - parseFloat(state?.crossMarginSummary?.totalMarginUsed || 0);
        const total = parseFloat(state?.marginSummary?.accountValue    || 0)
                    - parseFloat(state?.marginSummary?.totalMarginUsed || 0);
        const val   = cross > 0 ? cross : total;
        console.log('[HL margin] direct =>', { cross, total, withdrawable: state?.withdrawable, val });
        if (!cancelled) setMargin(val);
      } catch (e) {
        console.error('[HL margin] error:', e.message);
        if (!cancelled) setMargin(null);
      }
    };

    run();
    const t = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [mainAddress, vaultAddress]);

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
      const seen   = new Set();
      const hlUniq = [...hlMain, ...hlVault].filter(p => {
        const key = p.platform + '-' + p.coin;
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

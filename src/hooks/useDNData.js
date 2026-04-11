import { useState, useEffect, useCallback } from 'react';
//import { MARKETS } from './useLivePrices';
import { HL_API } from '../utils/dnHelpers';

async function fetchHLPositions(address, markets = []) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return [];
  try {
    // ─── Call natif HL + call HIP-3 xyz en parallèle ─────────────────
    const [resNative, resXyz] = await Promise.all([
      fetch(HL_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'clearinghouseState', user: address.trim() }),
      }),
      fetch(HL_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'clearinghouseState', user: address.trim(), dex: 'xyz' }),
      }),
    ]);

    const [stateNative, stateXyz] = await Promise.all([
      resNative.json(),
      resXyz.json(),
    ]);

    const parsePositions = (state) =>
      (state?.assetPositions || [])
        .filter(p => parseFloat(p.position?.szi) !== 0)
        .map(p => {
          const coin     = p.position.coin;
          const szi      = parseFloat(p.position.szi);
          const platform = coin.startsWith('xyz:')  ? 'xyz'
                         : coin.startsWith('hyna:') ? 'hyena'
                         : 'hyperliquid';
          const market   = markets.find(m => m.hlKey === coin);
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

    return [...parsePositions(stateNative), ...parsePositions(stateXyz)];

  } catch (e) { console.warn('fetchHLPositions error:', e.message); return []; }
}

async function fetchExtPositions(apiKey, markets = []) {
  if (!apiKey?.trim()) return [];
  try {
    const res  = await fetch(
      `/api/extended?endpoint=${encodeURIComponent('/user/positions')}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    const data = await res.json();
    return (data?.data || []).map(p => {
      const market = markets.find(m => m.extKey === p.market);
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

    if (!validMain && !validVault) {
      setMargin(null);
      setEffectiveAddress(null);
      return;
    }

    const addr = validVault ? vault : main;
    setEffectiveAddress(addr);

    let cancelled = false;
    const run = async () => {
      try {
        const res   = await fetch(HL_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'clearinghouseState', user: addr.toLowerCase() }),
        });
        const state = await res.json();
        if (!cancelled) setMargin(parseFloat(state?.withdrawable ?? 0));
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

export function useOpenPositions(mainAddress, vaultAddress, extApiKey, markets = []) {
  const [positions, setPositions] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // ─── Vérification des adresses au moment du clic ─────────────────────
  console.log('[OpenPositions] adresses au moment du load:', {
    mainAddress,
    vaultAddress,
    vaultValid: !!(vaultAddress && /^0x[0-9a-fA-F]{40}$/i.test(vaultAddress)),
    extApiKey: extApiKey ? extApiKey.slice(0, 8) + '…' : null,
  });
    try {
      const [hlMain, hlVault, extPos] = await Promise.all([
        fetchHLPositions(mainAddress, markets),
        fetchHLPositions(vaultAddress, markets),
        fetchExtPositions(extApiKey, markets),
      ]);
      console.log('[OpenPositions] results:', {
      mainCount:  hlMain.length,
      vaultCount: hlVault.length,
      extCount:   extPos.length,
    });
      const seen   = new Set();
      const hlUniq = [
        ...hlMain.map(p  => ({ ...p, wallet: 'main'  })),
        ...hlVault.map(p => ({ ...p, wallet: 'vault' })),
      ].filter(p => {
        const key = p.wallet + '-' + p.platform + '-' + p.coin;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setPositions([...hlUniq, ...extPos]);
    } catch (e) { console.warn('useOpenPositions error:', e.message); }
    finally { setLoading(false); }
  }, [mainAddress, vaultAddress, extApiKey, markets]);

  return { positions, loading, load };
}

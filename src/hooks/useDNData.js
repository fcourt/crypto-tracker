// hooks/useDNData.js
import { useState, useEffect, useCallback } from 'react';
import { HL_API } from '../utils/dnHelpers';


// ─── Helpers Nado subaccount ───────────────────────────────────────────────

const NADO_API = 'https://api.nado.xyz';

function buildSubaccount(address, subaccount = 'default') {
  // bytes32 = 20 bytes adresse + 12 bytes nom paddé — version browser (pas de Buffer)
  const addrHex = address.toLowerCase().replace('0x', '');

  // Encoder le nom en UTF-8 puis padder/tronquer à 12 bytes, converti en hex
  const encoder  = new TextEncoder();
  const nameBytes = encoder.encode(subaccount.slice(0, 12));
  const padded    = new Uint8Array(12); // initialisé à 0x00
  padded.set(nameBytes);

  const nameHex = Array.from(padded)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return '0x' + addrHex + nameHex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetchers positions
// ─────────────────────────────────────────────────────────────────────────────

async function fetchHLPositions(address, markets = []) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return [];
  try {
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
      { headers: { 'X-Api-Key': apiKey } },
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

/*
async function fetchNadoPositions(address, subaccount = 'default', markets = []) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return [];
  try {
    const [{ createNadoClient }, { createPublicClient, http }, { ink }] = await Promise.all([
      import('@nadohq/client'),
      import('viem'),
      import('viem/chains'),
    ]);
    const publicClient = createPublicClient({ chain: ink, transport: http() });
    const client       = createNadoClient('inkMainnet', undefined, publicClient);
    const info         = await client.subaccount.getSubaccountSummary({
      subaccountOwner: address.trim(),
      subaccountName:  subaccount || 'default',
    });
    return (info?.data?.positions || [])
      .filter(p => parseFloat(p.size) !== 0)
      .map(p => {
        const market = markets.find(m => m.nadoKey === p.market);
        const szi    = parseFloat(p.size);
        return {
          platform:      'nado',
          coin:          p.market,
          marketId:      market?.id ?? null,
          label:         market?.label ?? p.market,
          side:          szi > 0 ? 'LONG' : 'SHORT',
          szi:           Math.abs(szi),
          entryPx:       parseFloat(p.entryPrice || 0),
          unrealizedPnl: parseFloat(p.unrealizedPnl || 0),
        };
      });
  } catch (e) { console.warn('fetchNadoPositions error:', e.message); return []; }
}
*/

async function fetchNadoPositions(address, subaccount = 'default', markets = []) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return [];
  try {
    const sub = buildSubaccount(address, subaccount);
    const res = await fetch(`${NADO_API}/v1/subaccount/${sub}/positions`);
    const data = await res.json();
    return (data?.data || [])
      .filter(p => parseFloat(p.size) !== 0)
      .map(p => {
        const market = markets.find(m => m.nadoKey === p.market);
        const szi    = parseFloat(p.size);
        return {
          platform:      'nado',
          coin:          p.market,
          marketId:      market?.id ?? null,
          label:         market?.label ?? p.market,
          side:          szi > 0 ? 'LONG' : 'SHORT',
          szi:           Math.abs(szi),
          entryPx:       parseFloat(p.entryPrice || 0),
          unrealizedPnl: parseFloat(p.unrealizedPnl || 0),
        };
      });
  } catch (e) {
    console.warn('fetchNadoPositions error:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetchers marges
// ─────────────────────────────────────────────────────────────────────────────

async function fetchHLMainMargin(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return null;
  const res   = await fetch(HL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'clearinghouseState', user: address.trim().toLowerCase() }),
  });
  const state = await res.json();
  return parseFloat(state?.withdrawable ?? 0);
}

async function fetchHLVaultMargin(vaultAddress) {
  // Sous-compte HL : la marge libre est dans spotClearinghouseState (USDC, hold déduit)
  if (!vaultAddress || !/^0x[0-9a-fA-F]{40}$/i.test(vaultAddress.trim())) return null;
  const res   = await fetch(HL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'spotClearinghouseState', user: vaultAddress.trim().toLowerCase() }),
  });
  const state = await res.json();
  const usdc  = state?.balances?.find(b => b.coin === 'USDC');
  return parseFloat(usdc?.total ?? 0) - parseFloat(usdc?.hold ?? 0);
}

async function fetchHyenaMargin(mainAddress, vaultAddress) {
  // USDe est sur le spotClearinghouseState du compte principal OU du vault
  // On essaie vault en premier, puis main en fallback
  const addresses = [vaultAddress, mainAddress].filter(
    a => a && /^0x[0-9a-fA-F]{40}$/i.test(a.trim())
  );
  if (addresses.length === 0) return null;

  for (const addr of addresses) {
    try {
      const res   = await fetch(HL_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'spotClearinghouseState', user: addr.trim().toLowerCase() }),
      });
      const state = await res.json();
      const usde  = state?.balances?.find(b => b.coin === 'USDe');
      if (usde) return parseFloat(usde.total ?? 0) - parseFloat(usde.hold ?? 0);
    } catch (e) {
      console.warn('fetchHyenaMargin error on', addr, e.message);
    }
  }
  return null;
}

async function fetchExtMargin(apiKey) {
  if (!apiKey?.trim()) return null;
  const res  = await fetch(
    `/api/extended?endpoint=${encodeURIComponent('/user/balance')}`,
    { headers: { 'X-Api-Key': apiKey } },
  );
  const data = await res.json();
  return parseFloat(data?.data?.availableForTrade ?? 0);
}

/*
async function fetchNadoMargin(address, subaccount = 'default') {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return null;
  const [{ createNadoClient }, { createPublicClient, http }, { ink }] = await Promise.all([
    import('@nadohq/client'),
    import('viem'),
    import('viem/chains'),
  ]);
  const publicClient = createPublicClient({ chain: ink, transport: http() });
  const client       = createNadoClient('inkMainnet', undefined, publicClient);
  const info         = await client.subaccount.getSubaccountSummary({
    subaccountOwner: address.trim(),
    subaccountName:  subaccount || 'default',
  });
  // initialHealth = marge libre pour de nouvelles positions (équivalent free collateral)
  return parseFloat(info?.data?.initialHealth ?? 0);
}
*/

async function fetchNadoMargin(address, subaccount = 'default') {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return null;
  try {
    const sub = buildSubaccount(address, subaccount);
    const res = await fetch(`${NADO_API}/v1/subaccount/${sub}/summary`);
    const data = await res.json();
    return parseFloat(data?.data?.initialHealth ?? 0);
  } catch (e) {
    console.warn('fetchNadoMargin error:', e.message);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Hooks exportés — marges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useHLMargin — conservé pour compatibilité avec le code existant.
 * Préférer useMargins pour les nouveaux usages.
 */
export function useHLMargin(mainAddress, vaultAddress) {
  const [margin,           setMargin]           = useState(null);
  const [effectiveAddress, setEffectiveAddress] = useState(null);

  useEffect(() => {
    const main       = mainAddress?.trim();
    const vault      = vaultAddress?.trim();
    const validMain  = !!(main  && /^0x[0-9a-fA-F]{40}$/i.test(main));
    const validVault = !!(vault && /^0x[0-9a-fA-F]{40}$/i.test(vault));

    if (!validMain && !validVault) {
      setMargin(null);
      setEffectiveAddress(null);
      return;
    }

    const addr    = validVault ? vault : main;
    const isVault = validVault;
    setEffectiveAddress(addr);

    let cancelled = false;
    const run = async () => {
      try {
        const value = await (isVault
          ? fetchHLVaultMargin(addr)
          : fetchHLMainMargin(addr));
        if (!cancelled) setMargin(value);
      } catch (e) {
        console.error('[HL margin] error:', e.message);
        if (!cancelled) setMargin(null);
      }
    };

    run();
    const t = setInterval(run, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [mainAddress, vaultAddress]);

  return { margin, effectiveAddress };
}

export function useExtMargin(apiKey) {
  const [margin, setMargin] = useState(null);
  useEffect(() => {
    if (!apiKey?.trim()) return;
    let cancelled = false;
    const run = async () => {
      try {
        const value = await fetchExtMargin(apiKey);
        if (!cancelled) setMargin(value);
      } catch { if (!cancelled) setMargin(null); }
    };
    run();
    const t = setInterval(run, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [apiKey]);
  return margin;
}

// ─────────────────────────────────────────────────────────────────────────────
// useMargins — hook unifié, remplace getMarginForPlatform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   hlAddress:      string,
 *   hlVaultAddress: string,
 *   extApiKey:      string,
 *   nadoAddress:    string,
 *   nadoSubaccount: string,
 * }} cfg
 * @param {number} interval  ms (défaut 15 000)
 *
 * @returns {{ margins: Record<string, number|null>, refresh: () => void }}
 *
 * Usage dans DeltaNeutralPage :
 *   const { margins } = useMargins({ hlAddress, hlVaultAddress, extApiKey, nadoAddress, nadoSubaccount });
 *   const getMarginForPlatform = (platformId) => margins[platformId] ?? null;
 */
export function useMargins(cfg, interval = 15_000) {
  const { hlAddress, hlVaultAddress, extApiKey, nadoAddress, nadoSubaccount } = cfg;

  const [margins, setMargins] = useState({
    hyperliquid: null,
    xyz:         null,
    hyena:       null,
    extended:    null,
    nado:        null,
  });

  const refresh = useCallback(async () => {
    // HL margin : vault si défini, sinon compte principal
    const hlMarginFetcher = (hlVaultAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(hlVaultAddress.trim()))
      ? fetchHLVaultMargin(hlVaultAddress)   // sous-compte → solde spot USDC
      : fetchHLMainMargin(hlAddress);        // compte principal → withdrawable

    const results = await Promise.allSettled([
  (hlVaultAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(hlVaultAddress.trim()))
    ? fetchHLVaultMargin(hlVaultAddress)
    : fetchHLMainMargin(hlAddress),                              // hyperliquid
  (hlVaultAddress?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(hlVaultAddress.trim()))
    ? fetchHLVaultMargin(hlVaultAddress)
    : fetchHLMainMargin(hlAddress),                              // xyz (idem)
  fetchHyenaMargin(hlAddress, hlVaultAddress),
  fetchExtMargin(extApiKey),
  fetchNadoMargin(nadoAddress, nadoSubaccount || 'default'),
]);

    const keys = ['hyperliquid', 'xyz', 'hyena', 'extended', 'nado'];
    setMargins(
      Object.fromEntries(
        keys.map((key, i) => [
          key,
          results[i].status === 'fulfilled' ? results[i].value : null,
        ]),
      ),
    );
  }, [hlAddress, hlVaultAddress, extApiKey, nadoAddress, nadoSubaccount]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [refresh, interval]);

  return { margins, refresh };
}

// ─────────────────────────────────────────────────────────────────────────────
// useOrderBook
// ─────────────────────────────────────────────────────────────────────────────

export function useOrderBook(hlKey) {
  const [book, setBook] = useState({ bid: null, ask: null });
  useEffect(() => {
    if (!hlKey) return;
    let cancelled = false;
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
        if (!cancelled) setBook({ bid: isNaN(bid) ? null : bid, ask: isNaN(ask) ? null : ask });
      } catch { if (!cancelled) setBook({ bid: null, ask: null }); }
    };
    run();
    const t = setInterval(run, 5_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [hlKey]);
  return book;
}

// ─────────────────────────────────────────────────────────────────────────────
// useOpenPositions
// ─────────────────────────────────────────────────────────────────────────────

export function useOpenPositions(mainAddress, vaultAddress, extApiKey, nadoAddress, nadoSubaccount, markets = []) {
  const [positions, setPositions] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    console.log('[OpenPositions] load:', {
      mainAddress,
      vaultAddress,
      extApiKey: extApiKey ? extApiKey.slice(0, 8) + '…' : null,
      nadoAddress,
      nadoSubaccount,
    });
    try {
      const [hlMain, hlVault, extPos, nadoPos] = await Promise.all([
        fetchHLPositions(mainAddress,  markets),
        fetchHLPositions(vaultAddress, markets),
        fetchExtPositions(extApiKey,   markets),
        fetchNadoPositions(nadoAddress, nadoSubaccount, markets),
      ]);

      console.log('[OpenPositions] results:', {
        mainCount:  hlMain.length,
        vaultCount: hlVault.length,
        extCount:   extPos.length,
        nadoCount:  nadoPos.length,
      });

      // Déduplication HL main vs vault (même coin sur les deux)
      const seen   = new Set();
      const hlUniq = [
        ...hlMain.map(p  => ({ ...p, wallet: 'main'  })),
        ...hlVault.map(p => ({ ...p, wallet: 'vault' })),
      ].filter(p => {
        const key = `${p.wallet}-${p.platform}-${p.coin}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setPositions([...hlUniq, ...extPos, ...nadoPos]);
    } catch (e) { console.warn('useOpenPositions error:', e.message); }
    finally { setLoading(false); }
  }, [mainAddress, vaultAddress, extApiKey, nadoAddress, nadoSubaccount, markets]);

  return { positions, loading, load };
}

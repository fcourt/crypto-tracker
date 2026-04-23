// hooks/useDNData.js
import { useState, useEffect, useCallback } from 'react';
import { HL_API } from '../utils/dnHelpers';


// ─── Helpers Nado subaccount ───────────────────────────────────────────────

const NADO_GATEWAY = 'https://gateway.nado.xyz'; // endpoint gateway REST

function buildSubaccount(address, subaccount = 'default') {
  // bytes32 = 20 bytes adresse + 12 bytes nom UTF-8 paddé à droite avec 0x00
  const addrHex   = address.toLowerCase().replace('0x', '');
  const encoder   = new TextEncoder();
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
*/

async function fetchNadoPositions(address, subaccount = 'default', markets = []) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) return [];
  try {
    const sub = buildSubaccount(address.trim(), subaccount || 'default');
    const res = await fetch('/api/nado', {   // ← même proxy
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'subaccount_info', subaccount: sub }),
    });
    const data = await res.json();
    if (data?.status !== 'success' || !data?.data?.exists) return [];

    // perp_balances : amount scalé par 1e18, product_id → correspond au market Nado
    return (data.data.perp_balances || [])
      .filter(p => parseFloat(p.balance.amount) !== 0)
      .map(p => {
        const szi    = parseFloat(p.balance.amount) / 1e18;
        const market = markets.find(m => m.nadoProductId === p.product_id);
        // v_quote_balance négatif = entry cost → entryPx = abs(v_quote) / abs(size)
        const vQuote = parseFloat(p.balance.v_quote_balance) / 1e18;
        const entryPx = szi !== 0 ? Math.abs(vQuote / szi) : 0;
        return {
          platform:      'nado',
          coin:          market?.nadoKey ?? `product_${p.product_id}`,
          marketId:      market?.id ?? null,
          label:         market?.label ?? `product_${p.product_id}`,
          side:          szi > 0 ? 'LONG' : 'SHORT',
          szi:           Math.abs(szi),
          entryPx,
          unrealizedPnl: 0, // calculé côté UI avec le prix live
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

/*
async function fetchHyenaMargin(mainAddress, vaultAddress) {
  const candidates = [mainAddress, vaultAddress].filter(
    a => a?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(a.trim())
  );
  if (candidates.length === 0) return null;

  let best = null;
  for (const addr of candidates) {
    try {
      const res   = await fetch(HL_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'spotClearinghouseState', user: addr.trim().toLowerCase() }),
      });
      const state = await res.json();
      const usde  = state?.balances?.find(b => b.coin === 'USDe');
      if (usde) {
        const val = parseFloat(usde.total ?? 0) - parseFloat(usde.hold ?? 0);
        if (best === null || val > best) best = val; // garde le plus grand solde USDe trouvé
      }
    } catch (e) {
      console.warn('fetchHyenaMargin error on', addr, ':', e.message);
    }
  }
  return best;
}
*/

async function fetchHyenaMargin(mainAddress, vaultAddress) {
  // USDe est sur le spot HL du vault HyENA (sous-compte)
  // Si pas de vault, on essaie le compte principal
  const candidates = [vaultAddress, mainAddress].filter(
    a => a?.trim() && /^0x[0-9a-fA-F]{40}$/i.test(a.trim())
  );
  if (candidates.length === 0) {
    console.log('[HyENA] aucune adresse valide');
    return null;
  }

  for (const addr of candidates) {
    try {
      console.log('[HyENA] spotClearinghouseState pour:', addr);
      const res   = await fetch(HL_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'spotClearinghouseState', user: addr.trim().toLowerCase() }),
      });
      const state = await res.json();
      console.log('[HyENA] balances:', JSON.stringify(state?.balances));
      const usde  = state?.balances?.find(b => b.coin.toUpperCase() === 'USDE');
      if (usde) {
        const val = parseFloat(usde.total ?? 0) - parseFloat(usde.hold ?? 0);
        console.log('[HyENA] USDe trouvé sur', addr, ':', val);
        if (val > 0) return val;
      }
    } catch (e) {
      console.warn('[HyENA] error on', addr, ':', e.message);
    }
  }
  console.log('[HyENA] aucun USDe trouvé');
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
  try {
    const sub = buildSubaccount(address.trim(), subaccount || 'default');
    const res = await fetch(`${NADO_GATEWAY}/query`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'subaccount_info', subaccount: sub }),
    });
    const data = await res.json();
    if (data?.status !== 'success' || !data?.data?.exists) return null;
    // healths[0] = initial health (marge libre pour nouvelles positions), scalé par 1e18
    const health = data.data.healths?.[0]?.health;
    return health != null ? parseFloat(health) / 1e18 : null;
  } catch (e) {
    console.warn('fetchNadoMargin error:', e.message);
    return null;
  }
}
*/

async function fetchNadoMargin(address, subaccount = 'default') {
  if (!address || !/^0x[0-9a-fA-F]{40}$/i.test(address.trim())) {
    console.log('[Nado] adresse invalide ou vide:', address);
    return null;
  }
  try {
    const sub = buildSubaccount(address.trim(), subaccount || 'default');
    console.log('[Nado] subaccount bytes32:', sub);
    const res = await fetch('/api/nado', {   // ← proxy, pas gateway.nado.xyz direct
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'subaccount_info', subaccount: sub }),
    });
    console.log('[Nado] HTTP status:', res.status);
    const data = await res.json();
    console.log('[Nado] response:', JSON.stringify(data).slice(0, 300));
    if (data?.status !== 'success' || !data?.data?.exists) {
      console.log('[Nado] exists=false ou status!=success');
      return null;
    }
    // healths[0] = initial health, scalé par 1e18
    const health = data.data.healths?.[0]?.health;
    const result = health != null ? parseFloat(health) / 1e18 : null;
    console.log('[Nado] margin:', result);
    return result;
  } catch (e) {
    console.warn('[Nado] fetchNadoMargin error:', e.message);
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

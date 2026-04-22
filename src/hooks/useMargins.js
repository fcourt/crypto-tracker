// hooks/useMargins.js
import { useState, useEffect, useCallback } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

// ─── Fetchers individuels ───────────────────────────────────────────────────

async function fetchHLMargin(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: address }),
  });
  const state = await res.json();
  const accountValue    = parseFloat(state?.crossMarginSummary?.accountValue   ?? 0);
  const totalMarginUsed = parseFloat(state?.crossMarginSummary?.totalMarginUsed ?? 0);
  return accountValue - totalMarginUsed;
}

async function fetchHLVaultMargin(vaultAddress) {
  // Sous-compte HL : même endpoint, adresse différente
  return fetchHLMargin(vaultAddress);
}

async function fetchHyenaMargin(vaultAddress) {
  if (!vaultAddress || !/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) return null;

  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: vaultAddress }),
  });
  const state = await res.json();

  // HyENA règle les perps en USDe → chercher dans spotBalances
  const usdeBalance = state?.spotBalances?.find(
    (b) => b.coin === 'USDe',
  );

  if (usdeBalance) {
    // entryNtl = valeur notionnelle entrée, hold = bloqué en marge
    const total = parseFloat(usdeBalance.entryNtl ?? usdeBalance.total ?? 0);
    const hold  = parseFloat(usdeBalance.hold ?? 0);
    return total - hold;
  }

  // Fallback : crossMarginSummary du vault si pas de spotBalance USDe
  const accountValue    = parseFloat(state?.crossMarginSummary?.accountValue   ?? 0);
  const totalMarginUsed = parseFloat(state?.crossMarginSummary?.totalMarginUsed ?? 0);
  return accountValue - totalMarginUsed;
}

async function fetchExtMargin(apiKey) {
  if (!apiKey?.trim()) return null;
  const res = await fetch(
    `/api/extended?endpoint=${encodeURIComponent('userbalance')}`,
    { headers: { 'X-Api-Key': apiKey } },
  );
  const data = await res.json();
  return parseFloat(data?.data?.availableForTrade ?? 0);
}

async function fetchNadoMargin(address, subaccount = 'default') {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  // Import dynamique pour ne pas alourdir le bundle si Nado non utilisé
  const [{ createNadoClient }, { createPublicClient, http }, { ink }] = await Promise.all([
    import('@nadohq/client'),
    import('viem'),
    import('viem/chains'),
  ]);
  const publicClient = createPublicClient({ chain: ink, transport: http() });
  const client = createNadoClient('inkMainnet', undefined, publicClient);
  const info = await client.subaccount.getSubaccountSummary({
    subaccountOwner: address,
    subaccountName: subaccount || 'default',
  });
  return parseFloat(info?.data?.initialHealth ?? 0);
}

// ─── Fetcher map ────────────────────────────────────────────────────────────

const MARGIN_FETCHERS = {
  hyperliquid: (cfg) => fetchHLMargin(cfg.hlAddress),
  xyz:         (cfg) => fetchHLMargin(cfg.hlAddress),
  hyena:       (cfg) => fetchHyenaMargin(cfg.hlVaultAddress),  // ← USDe du vault
  extended:    (cfg) => fetchExtMargin(cfg.extApiKey),
  nado:        (cfg) => fetchNadoMargin(cfg.nadoAddress, cfg.nadoSubaccount),
};

// ─── Hook principal ─────────────────────────────────────────────────────────

/**
 * @param {object} cfg
 *   hlAddress, hlVaultAddress, extApiKey, nadoAddress, nadoSubaccount
 * @param {number} interval  — ms, défaut 15 000
 *
 * @returns {{ margins: Record<string, number|null>, refresh: () => void }}
 */
export function useMargins(cfg, interval = 15_000) {
  const [margins, setMargins] = useState(() =>
    Object.fromEntries(Object.keys(MARGIN_FETCHERS).map((k) => [k, null])),
  );

  const refresh = useCallback(async () => {
    const entries = await Promise.allSettled(
      Object.entries(MARGIN_FETCHERS).map(async ([platformId, fetcher]) => {
        try {
          const value = await fetcher(cfg);
          return [platformId, value];
        } catch (e) {
          console.warn(`useMargins [${platformId}] error:`, e.message);
          return [platformId, null];
        }
      }),
    );

    setMargins(
      Object.fromEntries(
        entries
          .filter((r) => r.status === 'fulfilled')
          .map((r) => r.value),
      ),
    );
  }, [cfg.hlAddress, cfg.hlVaultAddress, cfg.extApiKey, cfg.nadoAddress, cfg.nadoSubaccount]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [refresh, interval]);

  return { margins, refresh };
}

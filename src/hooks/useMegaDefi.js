const MEGA_RPC   = 'https://mainnet.megaeth.com/rpc';
const BLOCKSCOUT = 'https://megaeth.blockscout.com/api/v2';

// Adresses des contrats MegaETH (à confirmer via explorateur)
const CONTRACTS = {
  // Prism : factory Uniswap V2-like
  prismFactory:    '0x63242A4eA82847b20E506B63B0E2E2eFf0CC6cB0',
  // Kumbaya : pool lending
  kumbayaPool:     '0x026f252016a7C47cDEf1f05a3fc9E20C92A49C37',
};

// ABI minimal pour lire les positions LP (Uniswap V2 style)
const ERC20_BALANCE_OF = '0x70a08231'; // balanceOf(address)
const PAIR_TOKEN0      = '0x0dfe1681'; // token0()
const PAIR_TOKEN1      = '0xd21220a7'; // token1()
const PAIR_RESERVES    = '0x0902f1ac'; // getReserves()
const PAIR_TOTAL_SUPPLY = '0x18160ddd'; // totalSupply()

async function rpcCall(method, params) {
  const res = await fetch(MEGA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  return data.result;
}

function encodeCall(selector, address) {
  const padded = address.replace('0x', '').padStart(64, '0');
  return selector + padded;
}

async function getERC20Balance(tokenAddress, walletAddress) {
  const data = encodeCall(ERC20_BALANCE_OF, walletAddress);
  const raw = await rpcCall('eth_call', [{ to: tokenAddress, data }, 'latest']);
  return raw ? parseInt(raw, 16) : 0;
}

async function getTokenInfo(tokenAddress) {
  try {
    const res  = await fetch(`${BLOCKSCOUT}/tokens/${tokenAddress}`);
    const data = await res.json();
    return {
      symbol:       data.symbol || '???',
      name:         data.name || '???',
      decimals:     parseInt(data.decimals || 18),
      exchange_rate: parseFloat(data.exchange_rate || 0),
    };
  } catch { return { symbol: '???', name: '???', decimals: 18, exchange_rate: 0 }; }
}

// Récupère les LP tokens Prism détenus par le wallet
async function fetchPrismPositions(walletAddress) {
  const positions = [];
  try {
    // Récupère tous les token transfers pour trouver les LP tokens reçus
    const res  = await fetch(
      `${BLOCKSCOUT}/addresses/${walletAddress}/token-transfers?type=ERC-20`
    );
    if (!res.ok) return positions;
    const data = await res.json();

    // Identifie les contrats LP uniques (tokens reçus depuis le factory Prism)
    const lpCandidates = new Set();
    (data.items || []).forEach(t => {
      // Un LP token Prism vient typiquement d'un mint (from = 0x0)
      if (t.from?.hash === '0x0000000000000000000000000000000000000000') {
        lpCandidates.add(t.token?.address_hash);
      }
    });

    for (const lpAddress of lpCandidates) {
      if (!lpAddress) continue;
      try {
        // Balance LP du wallet
        const lpBalance = await getERC20Balance(lpAddress, walletAddress);
        if (lpBalance === 0) continue;

        // Total supply du LP
        const totalSupplyRaw = await rpcCall('eth_call', [{ to: lpAddress, data: PAIR_TOTAL_SUPPLY }, 'latest']);
        const totalSupply = parseInt(totalSupplyRaw, 16);

        // Tokens du pair
        const token0Raw = await rpcCall('eth_call', [{ to: lpAddress, data: PAIR_TOKEN0 }, 'latest']);
        const token1Raw = await rpcCall('eth_call', [{ to: lpAddress, data: PAIR_TOKEN1 }, 'latest']);
        const token0 = '0x' + token0Raw.slice(-40);
        const token1 = '0x' + token1Raw.slice(-40);

        // Réserves
        const reservesRaw = await rpcCall('eth_call', [{ to: lpAddress, data: PAIR_RESERVES }, 'latest']);
        const reserve0 = parseInt(reservesRaw.slice(2, 66), 16);
        const reserve1 = parseInt(reservesRaw.slice(66, 130), 16);

        // Part du wallet dans le pool
        const share = lpBalance / totalSupply;
        const amount0 = reserve0 * share;
        const amount1 = reserve1 * share;

        // Infos des tokens
        const [info0, info1] = await Promise.all([getTokenInfo(token0), getTokenInfo(token1)]);

        const usd0 = (amount0 / Math.pow(10, info0.decimals)) * info0.exchange_rate;
        const usd1 = (amount1 / Math.pow(10, info1.decimals)) * info1.exchange_rate;

        positions.push({
          protocol: 'Prism',
          type: 'LP',
          name: `${info0.symbol} / ${info1.symbol}`,
          token0: { symbol: info0.symbol, amount: amount0 / Math.pow(10, info0.decimals), usd: usd0 },
          token1: { symbol: info1.symbol, amount: amount1 / Math.pow(10, info1.decimals), usd: usd1 },
          totalUsd: usd0 + usd1,
          share: (share * 100).toFixed(4),
        });
      } catch (e) { console.error('Erreur LP position:', e); }
    }
  } catch (e) { console.error('Erreur Prism positions:', e); }
  return positions;
}

// Récupère les positions Kumbaya (lending/borrowing)
async function fetchKumbayaPositions(walletAddress) {
  const positions = [];
  try {
    // Cherche les interactions avec le contrat Kumbaya dans l'historique
    const res  = await fetch(`${BLOCKSCOUT}/addresses/${walletAddress}/transactions`);
    if (!res.ok) return positions;
    const data = await res.json();

    const kumbayaTxs = (data.items || []).filter(tx =>
      tx.to?.hash?.toLowerCase() === CONTRACTS.kumbayaPool.toLowerCase()
    );

    if (kumbayaTxs.length === 0) return positions;

    // Cherche les kTokens (tokens de lending) détenus par le wallet
    const tokenRes  = await fetch(`${BLOCKSCOUT}/addresses/${walletAddress}/tokens?type=ERC-20`);
    const tokenData = await tokenRes.json();

    // Les kTokens Kumbaya commencent typiquement par "k" dans leur symbole
    const kTokens = (tokenData.items || []).filter(t =>
      t.token?.symbol?.toLowerCase().startsWith('k') ||
      t.token?.name?.toLowerCase().includes('kumbaya')
    );

    kTokens.forEach(t => {
      const balance = parseFloat(t.value || 0) / Math.pow(10, parseInt(t.token?.decimals) || 18);
      const usd = balance * parseFloat(t.token?.exchange_rate || 0);
      positions.push({
        protocol: 'Kumbaya',
        type: 'Supply',
        name: t.token?.symbol || '???',
        token0: { symbol: t.token?.symbol, amount: balance, usd },
        totalUsd: usd,
      });
    });
  } catch (e) { console.error('Erreur Kumbaya positions:', e); }
  return positions;
}

export async function fetchDefiPositions(walletAddress) {
  const [prism, kumbaya] = await Promise.all([
    fetchPrismPositions(walletAddress),
    fetchKumbayaPositions(walletAddress),
  ]);
  return [...prism, ...kumbaya];
}

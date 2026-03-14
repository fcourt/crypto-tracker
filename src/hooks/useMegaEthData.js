const BLOCKSCOUT = 'https://megaeth.blockscout.com/api/v2';
const MEGA_RPC   = 'https://mainnet.megaeth.com/rpc';
const MEGA_BRIDGE_ADDRESS = '0x0ca3a2fbc3d770b578223fbb6b062fa875a2ee75';

async function rpcCall(method, params) {
  const res = await fetch(MEGA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  return data.result;
}

export async function fetchMegaEthData(address) {
  let transactions = [];
  let tokens       = [];
  let internalTxs  = [];
  let ethBalance   = 0;

  // Tokens ERC-20 — fonctionne
  try {
    const res  = await fetch(`${BLOCKSCOUT}/addresses/${address}/tokens?type=ERC-20`);
    const data = await res.json();
    tokens = data.items || [];
  } catch (e) { console.error('Erreur tokens:', e); }

  // Transactions — sans paramètre filter (absent = to + from)
  try {
    const res = await fetch(`${BLOCKSCOUT}/addresses/${address}/transactions?limit=50`);
    if (res.ok) {
      const data = await res.json();
      transactions = data.items || [];
      console.log('TX sample:', JSON.stringify(transactions.slice(0, 1), null, 2));
    } else {
      console.warn('TX status:', res.status, await res.text());
    }
  } catch (e) { console.error('Erreur transactions:', e); }

  // Internal transactions — sans paramètre filter
  try {
    const res = await fetch(`${BLOCKSCOUT}/addresses/${address}/internal-transactions?limit=50`);
    if (res.ok) {
      const data = await res.json();
      internalTxs = data.items || [];
    } else {
      console.warn('Internal TX status:', res.status);
    }
  } catch (e) { console.error('Erreur internal TX:', e); }

  // Balance ETH — via RPC officiel MegaETH
  try {
    const raw = await rpcCall('eth_getBalance', [address, 'latest']);
    ethBalance = parseInt(raw, 16) / 1e18;
  } catch (e) {
    // Fallback : coin_balance depuis l'info adresse Blockscout
    try {
      const res  = await fetch(`${BLOCKSCOUT}/addresses/${address}`);
      const data = await res.json();
      ethBalance = parseFloat(data.coin_balance || 0) / 1e18;
    } catch (e2) { console.error('Erreur balance:', e2); }
  }

  return { transactions, tokens, internalTxs, ethBalance };
}

export function computeMegaStats(transactions, internalTxs) {
  let totalGasEth    = 0;
  let dexVolumeUsd   = 0;
  let bridgeVolumeEth = 0;
  let dexTxCount     = 0;

  transactions.forEach(tx => {
    const gasUsed  = parseFloat(tx.gas_used  || 0);
    const gasPrice = parseFloat(tx.gas_price || 0);
    totalGasEth += (gasUsed * gasPrice) / 1e18;

    if (tx.token_transfers && tx.token_transfers.length >= 2) {
      dexTxCount += 1;
      tx.token_transfers.forEach(t => {
        if (t.total?.value && t.token?.exchange_rate) {
          const usdValue =
            (parseFloat(t.total.value) / Math.pow(10, parseInt(t.token.decimals) || 18))
            * parseFloat(t.token.exchange_rate);
          dexVolumeUsd += usdValue;
        }
      });
    }
  });

  internalTxs.forEach(tx => {
    if (tx.from?.hash?.toLowerCase() === MEGA_BRIDGE_ADDRESS.toLowerCase()) {
      bridgeVolumeEth += parseFloat(tx.value || 0) / 1e18;
    }
  });

  return { totalGasEth, dexVolumeUsd, bridgeVolumeEth, dexTxCount };
}

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
  let tokenTransfers = [];
  let ethBalance   = 0;

  // Tokens ERC-20
  try {
    const res  = await fetch(`${BLOCKSCOUT}/addresses/${address}/tokens?type=ERC-20`);
    const data = await res.json();
    tokens = data.items || [];
  } catch (e) { console.error('Erreur tokens:', e); }

  // Transactions
  try {
    const res = await fetch(`${BLOCKSCOUT}/addresses/${address}/transactions`);
    if (res.ok) {
      const data = await res.json();
      transactions = data.items || [];
    } else {
      console.warn('TX status:', res.status, await res.text());
    }
  } catch (e) { console.error('Erreur transactions:', e); }

  // Token transfers — endpoint séparé pour les swaps
  try {
    const res = await fetch(`${BLOCKSCOUT}/addresses/${address}/token-transfers?type=ERC-20`);
    if (res.ok) {
      const data = await res.json();
      tokenTransfers = data.items || [];
      console.log('Token transfers sample:', JSON.stringify(tokenTransfers.slice(0, 2), null, 2));
    }
  } catch (e) { console.error('Erreur token transfers:', e); }

  // Balance ETH via RPC
  try {
    const raw = await rpcCall('eth_getBalance', [address, 'latest']);
    ethBalance = parseInt(raw, 16) / 1e18;
  } catch (e) {
    // Fallback Blockscout address info
    try {
      const res  = await fetch(`${BLOCKSCOUT}/addresses/${address}`);
      const data = await res.json();
      ethBalance = parseFloat(data.coin_balance || 0) / 1e18;
      console.log('Balance via Blockscout:', ethBalance);
    } catch (e2) { console.error('Erreur balance:', e2); }
  }

  return { transactions, tokens, tokenTransfers, ethBalance };
}

export function computeMegaStats(transactions, tokenTransfers) {
  let totalGasEth  = 0;
  let dexVolumeUsd = 0;
  let dexTxCount   = 0;

  // Gas fees : fee.value est en wei
  transactions.forEach(tx => {
    const feeWei = parseFloat(tx.fee?.value || 0);
    totalGasEth += feeWei / 1e18;
  });

  // Swaps : groupe les token transfers par hash de transaction
  // Si un même hash a >= 2 transfers → c'est un swap
  const transfersByHash = {};
  tokenTransfers.forEach(t => {
    const hash = t.transaction_hash || t.tx_hash || '';
    if (!transfersByHash[hash]) transfersByHash[hash] = [];
    transfersByHash[hash].push(t);
  });

  Object.values(transfersByHash).forEach(transfers => {
    if (transfers.length >= 2) {
      dexTxCount += 1;
      // Compte le volume sur le transfer entrant (to = notre adresse)
      transfers.forEach(t => {
        if (t.to?.hash?.toLowerCase() === t.to?.hash?.toLowerCase()) {
          if (t.total?.value && t.token?.exchange_rate) {
            const usdValue =
              (parseFloat(t.total.value) / Math.pow(10, parseInt(t.token.decimals) || 18))
              * parseFloat(t.token.exchange_rate);
            dexVolumeUsd += usdValue;
          }
        }
      });
    }
  });

  return { totalGasEth, dexVolumeUsd, dexTxCount };
}

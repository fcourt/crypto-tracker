const BLOCKSCOUT = 'https://megaeth.blockscout.com/api/v2';

// RPC public MegaETH sans restriction CORS
const MEGA_RPC = 'https://6342.rpc.thirdweb.com';

async function rpcCall(method, params) {
  const res = await fetch(MEGA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  return data.result;
}

const MEGA_BRIDGE_ADDRESS = '0x0ca3a2fbc3d770b578223fbb6b062fa875a2ee75';

export async function fetchMegaEthData(address) {
  let transactions = [];
  let tokens = [];
  let internalTxs = [];
  let ethBalance = 0;

  // Tokens — fonctionne correctement
  try {
    const tokenRes = await fetch(`${BLOCKSCOUT}/addresses/${address}/tokens?type=ERC-20`);
    const tokenData = await tokenRes.json();
    tokens = tokenData.items || [];
  } catch (e) {
    console.error('Erreur tokens:', e);
  }

  // Transactions — utilise le bon endpoint Blockscout v2
  try {
    const txRes = await fetch(
      `${BLOCKSCOUT}/addresses/${address}/transactions?filter=to%20%7C%20from&limit=50`
    );
    if (txRes.ok) {
      const txData = await txRes.json();
      transactions = txData.items || [];
      console.log('TX sample:', JSON.stringify(transactions.slice(0, 1), null, 2));
    } else {
      console.warn('TX status:', txRes.status);
      // Fallback : endpoint alternatif
      const txRes2 = await fetch(`${BLOCKSCOUT}/transactions?address=${address}&limit=50`);
      if (txRes2.ok) {
        const txData2 = await txRes2.json();
        transactions = txData2.items || [];
      }
    }
  } catch (e) {
    console.error('Erreur transactions:', e);
  }

  // Internal transactions
  try {
    const intRes = await fetch(
      `${BLOCKSCOUT}/addresses/${address}/internal-transactions?filter=to%20%7C%20from&limit=50`
    );
    if (intRes.ok) {
      const intData = await intRes.json();
      internalTxs = intData.items || [];
    }
  } catch (e) {
    console.error('Erreur internal TX:', e);
  }

  // Balance ETH via RPC (thirdweb supporte CORS)
  try {
    const raw = await rpcCall('eth_getBalance', [address, 'latest']);
    ethBalance = parseInt(raw, 16) / 1e18;
  } catch (e) {
    // Fallback : lire depuis Blockscout address info
    try {
      const addrRes = await fetch(`${BLOCKSCOUT}/addresses/${address}`);
      const addrData = await addrRes.json();
      ethBalance = parseFloat(addrData.coin_balance || 0) / 1e18;
    } catch (e2) {
      console.error('Erreur balance:', e2);
    }
  }

  return { transactions, tokens, internalTxs, ethBalance };
}

export function computeMegaStats(transactions, internalTxs) {
  let totalGasEth = 0;
  let dexVolumeUsd = 0;
  let bridgeVolumeEth = 0;
  let dexTxCount = 0;

  transactions.forEach(tx => {
    const gasUsed = parseFloat(tx.gas_used || 0);
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

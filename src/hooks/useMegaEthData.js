// URLs candidates pour le Blockscout MegaETH mainnet
// On tente chaque URL jusqu'à obtenir une réponse valide
const BLOCKSCOUT_URLS = [
  'https://www.megaeth.com/api/v2',
  'https://explorer.megaeth.com/api/v2',
  'https://megaeth.blockscout.com/api/v2',
  'https://megaeth-mainnet.blockscout.com/api/v2',
];

// RPC direct MegaETH comme fallback pour ETH balance + gas
const MEGA_RPC = 'https://carrot.megaeth.com';
const MEGA_CHAIN_ID = '0x10e9'; // 4329 en hex (mainnet MegaETH)

async function rpcCall(method, params) {
  const res = await fetch(MEGA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  return data.result;
}

async function findWorkingBlockscout(address) {
  for (const base of BLOCKSCOUT_URLS) {
    try {
      const res = await fetch(`${base}/addresses/${address}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        console.log('Blockscout URL fonctionnelle:', base);
        return base;
      }
    } catch {
      // URL non disponible, on essaie la suivante
    }
  }
  return null;
}

const MEGA_BRIDGE_ADDRESS = '0x0ca3a2fbc3d770b578223fbb6b062fa875a2ee75';

export async function fetchMegaEthData(address) {
  // 1. Cherche l'URL Blockscout fonctionnelle
  const BLOCKSCOUT = await findWorkingBlockscout(address);

  let transactions = [];
  let tokens = [];
  let internalTxs = [];

  if (BLOCKSCOUT) {
    try {
      const [txRes, tokenRes, internalRes] = await Promise.all([
        fetch(`${BLOCKSCOUT}/addresses/${address}/transactions?limit=50`),
        fetch(`${BLOCKSCOUT}/addresses/${address}/tokens?type=ERC-20`),
        fetch(`${BLOCKSCOUT}/addresses/${address}/internal-transactions?limit=50`),
      ]);
      const [txData, tokenData, internalData] = await Promise.all([
        txRes.json(),
        tokenRes.json(),
        internalRes.json(),
      ]);

      console.log('TX sample:', JSON.stringify((txData.items || []).slice(0, 1), null, 2));
      console.log('Token sample:', JSON.stringify((tokenData.items || []).slice(0, 1), null, 2));
      console.log('Internal TX sample:', JSON.stringify((internalData.items || []).slice(0, 1), null, 2));

      transactions = txData.items || [];
      tokens = tokenData.items || [];
      internalTxs = internalData.items || [];
    } catch (e) {
      console.error('Erreur Blockscout:', e);
    }
  }

  // 2. Fallback RPC : ETH balance directement depuis le nœud
  let ethBalanceWei = '0x0';
  try {
    ethBalanceWei = await rpcCall('eth_getBalance', [address, 'latest']);
  } catch (e) {
    console.error('Erreur RPC balance:', e);
  }

  const ethBalance = parseInt(ethBalanceWei, 16) / 1e18;

  return { transactions, tokens, internalTxs, ethBalance, blockscoutAvailable: !!BLOCKSCOUT };
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
          const usdValue = (parseFloat(t.total.value) / Math.pow(10, t.token?.decimals || 18))
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

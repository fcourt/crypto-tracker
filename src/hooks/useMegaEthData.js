const BLOCKSCOUT = 'https://megaeth.blockscout.com/api/v2';

export async function fetchMegaEthData(address) {
  const headers = { 'Content-Type': 'application/json' };

  const [txRes, tokenRes, internalRes] = await Promise.all([
    // Transactions (gas fees + volume DEX)
    fetch(`${BLOCKSCOUT}/addresses/${address}/transactions?limit=50`, { headers }),
    // Tokens détenus
    fetch(`${BLOCKSCOUT}/addresses/${address}/tokens?type=ERC-20`, { headers }),
    // Transactions internes (bridge deposits)
    fetch(`${BLOCKSCOUT}/addresses/${address}/internal-transactions?limit=50`, { headers }),
  ]);

  const [txData, tokenData, internalData] = await Promise.all([
    txRes.json(),
    tokenRes.json(),
    internalRes.json(),
  ]);

  // DEBUG — à supprimer après vérification
  console.log('TX sample:', JSON.stringify((txData.items || []).slice(0, 2), null, 2));
  console.log('Token sample:', JSON.stringify((tokenData.items || []).slice(0, 2), null, 2));
  console.log('Internal TX sample:', JSON.stringify((internalData.items || []).slice(0, 2), null, 2));

  return {
    transactions: txData.items || [],
    tokens: tokenData.items || [],
    internalTxs: internalData.items || [],
  };
}

// Adresse du bridge canonique MegaETH sur Ethereum
const MEGA_BRIDGE_ADDRESS = '0x0ca3a2fbc3d770b578223fbb6b062fa875a2ee75';

export function computeMegaStats(transactions, internalTxs) {
  let totalGasEth = 0;
  let dexVolumeUsd = 0;
  let bridgeVolumeEth = 0;
  let dexTxCount = 0;

  transactions.forEach(tx => {
    // Gas fees
    const gasUsed = parseFloat(tx.gas_used || 0);
    const gasPrice = parseFloat(tx.gas_price || 0);
    totalGasEth += (gasUsed * gasPrice) / 1e18;

    // Heuristique DEX : tx avec token transfers multiples = swap
    if (tx.token_transfers && tx.token_transfers.length >= 2) {
      dexTxCount += 1;
      // Volume approximatif basé sur les transfers USD si disponible
      tx.token_transfers.forEach(t => {
        if (t.total?.value && t.token?.exchange_rate) {
          const usdValue = (parseFloat(t.total.value) / Math.pow(10, t.token.decimals || 18))
            * parseFloat(t.token.exchange_rate);
          dexVolumeUsd += usdValue;
        }
      });
    }
  });

  // Bridge : transactions reçues depuis l'adresse du bridge
  internalTxs.forEach(tx => {
    if (tx.from?.hash?.toLowerCase() === MEGA_BRIDGE_ADDRESS.toLowerCase()) {
      bridgeVolumeEth += parseFloat(tx.value || 0) / 1e18;
    }
  });

  return { totalGasEth, dexVolumeUsd, bridgeVolumeEth, dexTxCount };
}

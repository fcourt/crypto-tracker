import { useState } from 'react';
import { fetchMegaEthData, computeMegaStats } from '../hooks/useMegaEthData';

const BLOCKSCOUT_URL = 'https://megaeth.blockscout.com/address';

export default function MegaEthTab({ address }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMegaEthData(address);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!address) return (
    <p className="text-center text-gray-500 py-12 text-sm">
      Entrez une adresse wallet pour voir les données MegaETH.
    </p>
  );

  if (!data && !loading) return (
    <div className="flex justify-center py-8">
      <button
        onClick={load}
        className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors"
      >
        Charger les données MegaETH
      </button>
    </div>
  );

  if (loading) return (
    <p className="text-center text-gray-500 py-12 text-sm">Chargement...</p>
  );

  if (error) return (
    <div className="mx-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
      {error}
    </div>
  );

  const stats = computeMegaStats(data.transactions, data.internalTxs);

  return (
    <div className="space-y-6 pb-8">

      {/* Stats globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4">
        {[
          { label: 'Volume DEX (approx.)', value: `$${stats.dexVolumeUsd.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}` },
          { label: 'Swaps détectés', value: stats.dexTxCount },
          { label: 'Gas fees payées', value: `${stats.totalGasEth.toFixed(6)} ETH` },
          { label: 'Bridge entrant', value: `${stats.bridgeVolumeEth.toFixed(4)} ETH` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-gray-400 text-xs mb-1">{label}</p>
            <p className="text-lg font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Tokens détenus */}
      <div className="mx-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Tokens ERC-20 détenus ({data.tokens.length})
        </h3>
        {data.tokens.length === 0 ? (
          <p className="text-gray-600 text-sm">Aucun token ERC-20 trouvé.</p>
        ) : (
          <div className="rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs">
                <tr>
                  {['Token', 'Symbole', 'Balance', 'Valeur USD'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.tokens.map((item, i) => {
                  const balance = parseFloat(item.value || 0) / Math.pow(10, item.token?.decimals || 18);
                  const usd = item.token?.exchange_rate
                    ? (balance * parseFloat(item.token.exchange_rate)).toFixed(2)
                    : '-';
                  return (
                    <tr key={i} className="hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-white">{item.token?.name || '-'}</td>
                      <td className="px-4 py-2 text-blue-400 font-medium">{item.token?.symbol || '-'}</td>
                      <td className="px-4 py-2 text-gray-300">{balance.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}</td>
                      <td className="px-4 py-2 text-gray-300">{usd !== '-' ? `$${usd}` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dernières transactions */}
      <div className="mx-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Dernières transactions ({data.transactions.length})
        </h3>
        {data.transactions.length === 0 ? (
          <p className="text-gray-600 text-sm">Aucune transaction trouvée.</p>
        ) : (
          <div className="rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs">
                <tr>
                  {['Date', 'Hash', 'Type', 'Valeur ETH', 'Gas (ETH)', 'Statut'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.transactions.slice(0, 50).map((tx, i) => {
                  const gasEth = ((parseFloat(tx.gas_used || 0) * parseFloat(tx.gas_price || 0)) / 1e18).toFixed(8);
                  const valueEth = (parseFloat(tx.value || 0) / 1e18).toFixed(6);
                  const isSwap = tx.token_transfers?.length >= 2;
                  const hash = tx.hash || '';
                  return (
                    <tr key={i} className="hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                        {tx.timestamp
                          ? new Date(tx.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                          : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <a
                          href={`${BLOCKSCOUT_URL}/${address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                        >
                          {hash.slice(0, 8)}...{hash.slice(-6)}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isSwap ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-700 text-gray-400'}`}>
                          {isSwap ? 'Swap' : tx.method || 'Transfer'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-300">{valueEth}</td>
                      <td className="px-4 py-2 text-gray-500">{gasEth}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs ${tx.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.status === 'ok' ? '✓' : '✗'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lien explorateur */}
      <div className="px-4">
        <a
          href={`${BLOCKSCOUT_URL}/${address}`}
          target="_blank"
          rel="noreferrer"
          className="text-blue-400 hover:text-blue-300 text-sm underline"
        >
          Voir le wallet complet sur MegaETH Blockscout →
        </a>
      </div>

    </div>
  );
}

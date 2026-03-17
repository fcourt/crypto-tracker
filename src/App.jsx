import { useState, useMemo } from 'react';
import WalletInput from './components/WalletInput';
import PlatformTabs from './components/PlatformTabs';
import VolumeStats from './components/VolumeStats';
import VolumeChart from './components/VolumeChart';
import TradeTable from './components/TradeTable';
import MegaEthTab from './components/MegaEthTab';
import FundingPanel from './components/FundingPanel';
import { useHyperliquidFills } from './hooks/useHyperliquidFills';
import { getPlatform, filterByPlatform, computeStats } from './utils/platformFilter';

export default function App() {
  const { fills, loading, error, fetchFills } = useHyperliquidFills();
  const [activePlatform, setActivePlatform] = useState('all');
  const [activeChain, setActiveChain] = useState('hyperliquid');
  const [walletAddress, setWalletAddress] = useState('');

  const filteredFills = useMemo(() => {
    return filterByPlatform(fills, activePlatform);
  }, [fills, activePlatform]);

  const stats = useMemo(() => computeStats(filteredFills), [filteredFills]);

  const countByPlatform = useMemo(() => ({
    all:         fills.length,
    hyperliquid: fills.filter(f => getPlatform(f.coin) === 'hyperliquid').length,
    xyz:         fills.filter(f => getPlatform(f.coin) === 'xyz').length,
    hyena:       fills.filter(f => getPlatform(f.coin) === 'hyena').length,
    other_hip3:  fills.filter(f => getPlatform(f.coin) === 'other_hip3').length,
  }), [fills]);

  const handleSearch = (address, startTime) => {
    setWalletAddress(address);
    fetchFills(address, startTime);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">

      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-4">
        <h1 className="text-xl font-bold text-white">Perp Tracker</h1>
        <p className="text-gray-500 text-sm">Hyperliquid · trade.xyz · HyENA · MegaETH</p>
      </div>

      {/* Wallet Search */}
      <WalletInput onSearch={handleSearch} loading={loading} />

      {error && (
        <div className="mx-4 mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Sélecteur de chaîne principal */}
      <div className="flex gap-2 px-4 mt-2 mb-4">
        {[
          { id: 'hyperliquid', label: '⚡ Hyperliquid Perps' },
          { id: 'megaeth',     label: '🔷 MegaETH' },
        ].map(chain => (
          <button
            key={chain.id}
            onClick={() => setActiveChain(chain.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeChain === chain.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {chain.label}
          </button>
        ))}
      </div>

      {/* Contenu Hyperliquid */}
      {activeChain === 'hyperliquid' && (
        <>
          {fills.length > 0 && (
            <>
              <PlatformTabs
                active={activePlatform}
                onChange={setActivePlatform}
                countByPlatform={countByPlatform}
              />
              <VolumeStats stats={stats} />
              <VolumeChart fills={filteredFills} />
              <div className="mt-4">
                <TradeTable fills={filteredFills} />
              </div>

              {/* Panneau Funding */}
              <div className="mt-6 pb-8">
                <h2 className="text-sm font-medium text-gray-400 px-4 mb-3">💰 Funding Perps</h2>
                <FundingPanel
                  key={walletAddress}
                  address={walletAddress}
                  startTime={null}
                />
              </div>
            </>
          )}
          {!loading && fills.length === 0 && !error && (
            <div className="text-center text-gray-600 py-20 text-sm">
              Entrez une adresse wallet pour commencer
            </div>
          )}
        </>
      )}

      {/* Contenu MegaETH */}
      {activeChain === 'megaeth' && (
        <MegaEthTab address={walletAddress} />
      )}

    </div>
  );
}

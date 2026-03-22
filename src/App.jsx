import { useState, useMemo } from 'react';
import WalletInput from './components/WalletInput';
import PlatformTabs from './components/PlatformTabs';
import VolumeStats from './components/VolumeStats';
import VolumeChart from './components/VolumeChart';
import TradeTable from './components/TradeTable';
import MegaEthTab from './components/MegaEthTab';
import FundingPanel from './components/FundingPanel';
import PerpDexPage from './pages/PerpDexPage';
import DeltaNeutralPage from './pages/DeltaNeutralPage';
import { useHyperliquidFills } from './hooks/useHyperliquidFills';
import { getPlatform, filterByPlatform, computeStats } from './utils/platformFilter';

const TABS = [
  { id: 'hyperliquid', label: '⚡ Hyperliquid' },
  { id: 'megaeth',     label: '🔷 MegaETH' },
  { id: 'perpdex',     label: '📊 PerpDex' },
  { id: 'deltaneutral', label: '⚖️ Delta Neutral' }, 
];

export default function App() {
  const { fills, loading, error, fetchFills } = useHyperliquidFills();
  const [activeTab, setActiveTab]         = useState('hyperliquid');
  const [activePlatform, setActivePlatform] = useState('all');
  const [walletAddress, setWalletAddress] = useState('');

  const filteredFills = useMemo(() =>
    filterByPlatform(fills, activePlatform), [fills, activePlatform]);
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

      {/* Header + Onglets */}
      <div className="border-b border-gray-800">
        <div className="px-4 pt-4 pb-0">
          <h1 className="text-xl font-bold text-white">Perp Tracker</h1>
        </div>
        <div className="flex gap-1 px-4 mt-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-white border-blue-500'
                  : 'bg-transparent text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Onglet Hyperliquid */}
      {activeTab === 'hyperliquid' && (
        <div className="pt-4">
          <WalletInput onSearch={handleSearch} loading={loading} />
          {error && (
            <div className="mx-4 mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
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
        </div>
      )}

      {/* Onglet MegaETH */}
      {activeTab === 'megaeth' && (
      <div className="pt-4">
        <WalletInput onSearch={handleSearch} loading={loading} />
        {error && (
        <div className="mx-4 mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
        <MegaEthTab address={walletAddress} />
      </div>
    )}

      {/* Onglet PerpDex */}
      {activeTab === 'perpdex' && (
        <div className="pt-4">
          <PerpDexPage />
        </div>
      )}

      {/*Onglet Position Deltra Neutral*/}
      {activeTab === 'deltaneutral' && (
      <div className="pt-4">
        <DeltaNeutralPage />
      </div>
    )}

    </div>
  );
}

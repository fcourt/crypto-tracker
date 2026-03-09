import { useState, useMemo } from 'react';
import WalletInput from './components/WalletInput';
import PlatformTabs from './components/PlatformTabs';
import VolumeStats from './components/VolumeStats';
import VolumeChart from './components/VolumeChart';
import TradeTable from './components/TradeTable';
import { useHyperliquidFills } from './hooks/useHyperliquidFills';
import { getPlatform, filterByPlatform, computeStats } from './utils/platformFilter';

export default function App() {
  const { fills, loading, error, fetchFills } = useHyperliquidFills();
  const [activePlatform, setActivePlatform] = useState('all');

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="border-b border-gray-800 px-4 py-4">
        <h1 className="text-xl font-bold text-white">Perp Tracker</h1>
        <p className="text-gray-500 text-sm">Hyperliquid · trade.xyz · HyENA</p>
      </div>

      <WalletInput onSearch={fetchFills} loading={loading} />

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
          <div className="mt-4 pb-8">
            <TradeTable fills={filteredFills} />
          </div>
        </>
      )}

      {!loading && fills.length === 0 && !error && (
        <div className="text-center text-gray-600 py-20 text-sm">
          Entrez une adresse wallet pour commencer
        </div>
      )}
    </div>
  );
}

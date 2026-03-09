import { useState, useMemo, useEffect } from 'react';
import WalletInput from './components/WalletInput';
import PlatformTabs from './components/PlatformTabs';
import VolumeStats from './components/VolumeStats';
import VolumeChart from './components/VolumeChart';
import TradeTable from './components/TradeTable';
import { useHyperliquidFills } from './hooks/useHyperliquidFills';
import { useHyperliquidMeta } from './hooks/useHyperliquidMeta';
import { getPlatform, filterByPlatform, computeStats } from './utils/platformFilter';

export default function App() {
  const { fills, loading, error, fetchFills } = useHyperliquidFills();
  const coinPlatformMap = useHyperliquidMeta(); // chargé une seule fois au démarrage

// DEBUG — à supprimer après vérification
// DEBUG — remplace l'ancien useEffect
useEffect(() => {
  if (Object.keys(coinPlatformMap).length > 0 && fills.length > 0) {
    console.log('coinPlatformMap size:', Object.keys(coinPlatformMap).length);
    console.log('fills count:', fills.length);
    console.log('filteredFills count (xyz):', fills.filter(f => getPlatform(f.coin, coinPlatformMap) === 'xyz').length);
    console.log('filteredFills count (hyena):', fills.filter(f => getPlatform(f.coin, coinPlatformMap) === 'hyena').length);

    // Vérifie si les clés matchent
    const xyzFills = fills.filter(f => f.coin.startsWith('xyz:'));
    console.log('Fills avec préfixe xyz:', xyzFills.length);
    if (xyzFills.length > 0) {
      console.log('Exemple fill xyz:', xyzFills[0].coin);
      console.log('Valeur dans la map:', coinPlatformMap[xyzFills[0].coin]);
    }
  }
}, [coinPlatformMap, fills]); // ← les deux dépendances

  
  
  const [activePlatform, setActivePlatform] = useState('all');

// Attend que la map soit chargée avant de filtrer
const isMetaReady = Object.keys(coinPlatformMap).length > 0;

const filteredFills = useMemo(() => {
  if (!isMetaReady) return activePlatform === 'all' ? fills : [];
  return filterByPlatform(fills, activePlatform, coinPlatformMap);
}, [fills, activePlatform, coinPlatformMap, isMetaReady]);

const countByPlatform = useMemo(() => {
  if (!isMetaReady) return { all: fills.length, hyperliquid: 0, xyz: 0, hyena: 0, other_hip3: 0 };
  return {
    all:         fills.length,
    hyperliquid: fills.filter(f => getPlatform(f.coin, coinPlatformMap) === 'hyperliquid').length,
    xyz:         fills.filter(f => getPlatform(f.coin, coinPlatformMap) === 'xyz').length,
    hyena:       fills.filter(f => getPlatform(f.coin, coinPlatformMap) === 'hyena').length,
    other_hip3:  fills.filter(f => getPlatform(f.coin, coinPlatformMap) === 'other_hip3').length,
  };
}, [fills, coinPlatformMap, isMetaReady]);


  const stats = useMemo(() => computeStats(filteredFills), [filteredFills]);

  
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

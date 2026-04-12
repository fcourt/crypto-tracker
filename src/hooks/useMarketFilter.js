// src/hooks/useMarketFilter.js
import { useState, useEffect } from 'react';
//import { MARKETS } from './useLivePrices';
import { fetchHLAvailableKeys, fetchXyzAvailableKeys, fetchHyenaAvailableKeys } from '../services/markets/adapters/hyperliquid';
import { fetchExtAvailableKeys }  from '../services/markets/adapters/extended';
import { fetchNadoAvailableKeys } from '../services/markets/adapters/nado';

// Dispatche vers le bon adapter selon la plateforme
const FETCHERS = {
  hyperliquid: fetchHLAvailableKeys,
  xyz:         fetchXyzAvailableKeys,
  hyena:       fetchHyenaAvailableKeys,
  extended:    fetchExtAvailableKeys,
  nado:        fetchNadoAvailableKeys,
};

// Vérifie si un marché est dans le Set de la plateforme
function checkAvailable(market, platformId, keys) {
  if (!keys) return true; // pas encore chargé → ne pas bloquer l'affichage

  switch (platformId) {
    case 'hyperliquid':
    case 'xyz':
    case 'hyena':
      return market.hlKey != null && keys.has(market.hlKey);
    case 'extended':
      return market.extKey != null && keys.has(market.extKey);
    case 'nado':
      return market.nadoKey != null && keys.has(market.nadoKey);
    default:
      return false;
  }
}

export function useMarketFilter(platform1, platform2, markets = []) {
  // availabilityMap : { hyperliquid: Set, extended: Set, nado: Set, ... }
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  //const platforms = [...new Set([platform1, platform2].filter(Boolean))];
  const platforms = [...new Set([platform1, platform2].filter(p => p !== '' && p != null))];
  const cacheKey  = platforms.slice().sort().join(',');

  useEffect(() => {
    if (platforms.length === 0) return;

    setLoading(true);

    const fetches = platforms.map(async pid => {
      const fetcher = FETCHERS[pid];
      if (!fetcher) return [pid, null];
      try {
        const keys = await fetcher();
        return [pid, keys];
      } catch (err) {
        console.warn(`useMarketFilter: échec pour ${pid}`, err);
        return [pid, null]; // échec silencieux → on affiche quand même
      }
    });

    Promise.all(fetches).then(results => {
      const map = Object.fromEntries(results);
      const errs = Object.fromEntries(results.filter(([, v]) => v === null));
      setAvailabilityMap(prev => ({ ...prev, ...map }));
      setErrors(errs);
      setLoading(false);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Filtre : le marché doit être dispo sur TOUTES les plateformes sélectionnées
  const filteredMarkets = markets.filter(m =>
    platforms.every(pid => checkAvailable(m, pid, availabilityMap[pid]))
  );

  const isIntersection = platforms.length === 2;

  return {
    filteredMarkets,
    loading,
    errors,
    isIntersection,
    counts: Object.fromEntries(
      platforms.map(pid => [
        pid,
        markets.filter(m => checkAvailable(m, pid, availabilityMap[pid])).length,
      ])
    ),
  };
}

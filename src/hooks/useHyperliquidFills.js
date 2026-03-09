import { useState, useCallback } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

export function useHyperliquidFills() {
  const [fills, setFills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFills = useCallback(async (address, startTime = null) => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setError('Adresse Ethereum invalide');
      return;
    }
    setLoading(true);
    setError(null);
    setFills([]);
    try {
      const body = startTime
        ? { type: 'userFillsByTime', user: address, startTime, endTime: Date.now() }
        : { type: 'userFills', user: address };

      const res = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);
      const data = await res.json();

      const filteredFills = data.filter(f => !f.coin.startsWith('@'));

      // DEBUG — à supprimer après vérification
      console.log('Exemple de fills:', JSON.stringify(filteredFills.slice(0, 5), null, 2));

      setFills(filteredFills);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { fills, loading, error, fetchFills };
}

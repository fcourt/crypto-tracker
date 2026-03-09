import { useState, useCallback } from 'react';

const HL_API = 'https://api.hyperliquid.xyz/info';

// Builder codes connus
const BUILDERS = {
  'hyperliquid': null,                                       // natif
  'xyz': '0x88806a71D74ad0a510b350545C9aE490912F0888',       // trade.xyz deployer
  'hyena': '0x1924b8561eeF20e70Ede628A296175D358BE80e5',     // HyENA builder code
};

export function useHyperliquidFills() {
  const [fills, setFills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFills = useCallback(async (address, startTime = null) => {
    setLoading(true);
    setError(null);
    try {
      const body = startTime
        ? { type: 'userFillsByTime', user: address, startTime, endTime: Date.now() }
        : { type: 'userFills', user: address };

      const res = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      setFills(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { fills, loading, error, fetchFills };
}

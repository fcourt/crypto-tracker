import { useState } from 'react';
import { PLATFORMS } from '../../hooks/useLivePrices';
import { HL_API } from '../../utils/dnHelpers';
import DropSection from './DropSection';

export default function FeeConfigPanel({ fees, onChange }) {
  const [fetching, setFetching] = useState({});

  const fetchHLFee = async () => {
    setFetching(f => ({ ...f, hyperliquid: true }));
    try {
      const res  = await fetch(HL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });
      const data = await res.json();
      console.log('HL fee meta:', data?.feeTiers);
    } catch (e) { console.warn('fetchHLFee error:', e); }
    finally { setFetching(f => ({ ...f, hyperliquid: false })); }
  };

  const fetchExtFee = async (pid) => {
    setFetching(f => ({ ...f, [pid]: true }));
    try {
      const res  = await fetch(`/api/extended?endpoint=${encodeURIComponent('/info/markets')}`);
      const data = await res.json();
      console.log('Extended market fee data:', (data?.data || [])[0]);
    } catch (e) { console.warn('fetchExtFee error:', e); }
    finally { setFetching(f => ({ ...f, [pid]: false })); }
  };

  return (
    <DropSection title="⚙️ Taux de fees par plateforme">
      <div className="px-4 py-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500">
          Ces fees alimentent le calcul du P&amp;L break-even dans la section Trades Ouverts.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(fees).map(([pid, f]) => {
            const plat = PLATFORMS.find(p => p.id === pid);
            return (
              <div key={pid} className="bg-gray-900 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-200">{plat?.label ?? pid}</p>
                  <button
                    onClick={() => pid === 'hyperliquid' ? fetchHLFee() : fetchExtFee(pid)}
                    disabled={fetching[pid]}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    title="Recharger depuis l'API"
                  >
                    {fetching[pid] ? <span className="animate-spin inline-block">⟳</span> : '🔄'}
                  </button>
                </div>
                <label className="text-xs text-gray-500">Maker (%)</label>
                <input
                  type="number" step="0.001" min="0"
                  value={(f.maker * 100).toFixed(3)}
                  onChange={e => onChange(pid, 'maker', parseFloat(e.target.value) / 100)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <label className="text-xs text-gray-500">Taker (%)</label>
                <input
                  type="number" step="0.001" min="0"
                  value={(f.taker * 100).toFixed(3)}
                  onChange={e => onChange(pid, 'taker', parseFloat(e.target.value) / 100)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            );
          })}
        </div>
      </div>
    </DropSection>
  );
}

import { useState } from 'react';

const PERIODS = [
  { label: '7 jours', ms: 7 * 86400000 },
  { label: '30 jours', ms: 30 * 86400000 },
  { label: '90 jours', ms: 90 * 86400000 },
  { label: 'Tout', ms: null },
];

export default function WalletInput({ onSearch, loading }) {
  const [address, setAddress] = useState('');
  const [period, setPeriod] = useState(PERIODS[1]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const startTime = period.ms ? Date.now() - period.ms : null;
    onSearch(address.trim(), startTime);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 p-4">
      <input
        type="text"
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder="Adresse wallet (0x...)"
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <select
        value={period.label}
        onChange={e => setPeriod(PERIODS.find(p => p.label === e.target.value))}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
      >
        {PERIODS.map(p => (
          <option key={p.label} value={p.label}>{p.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={loading || !address}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors"
      >
        {loading ? 'Chargement...' : 'Rechercher'}
      </button>
    </form>
  );
}

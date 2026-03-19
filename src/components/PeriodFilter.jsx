import { useState } from 'react';

export function getDateRange(period) {
  const now = new Date();
  if (period.type === 'week') {
    const start = new Date(now);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  }
  if (period.type === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start, to: now };
  }
  if (period.type === 'custom' && period.from && period.to) {
    return {
      from: new Date(period.from),
      to:   new Date(period.to + 'T23:59:59'),
    };
  }
  return { from: null, to: null };
}

export default function PeriodFilter({ value, onChange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const handlePreset = (type) => {
    setShowCustom(false);
    onChange({ type });
  };

  const handleApply = () => {
    if (!customFrom || !customTo) return;
    onChange({ type: 'custom', from: customFrom, to: customTo });
    setShowCustom(false);
  };

  const presets = [
    { type: 'all',   label: 'Tout' },
    { type: 'month', label: 'Ce mois' },
    { type: 'week',  label: 'Cette semaine' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Période :</span>
        <div className="flex gap-1 flex-wrap">
          {presets.map(p => (
            <button
              key={p.type}
              onClick={() => handlePreset(p.type)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                value.type === p.type && !showCustom
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showCustom || value.type === 'custom'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            📅 Personnalisé
          </button>
        </div>
        {value.type === 'custom' && !showCustom && (
          <span className="text-xs text-blue-400">
            {value.from} → {value.to}
          </span>
        )}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 border border-gray-700 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-500">Du</span>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-500">au</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleApply}
            disabled={!customFrom || !customTo}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium px-3 py-1 rounded-lg"
          >
            Appliquer
          </button>
        </div>
      )}
    </div>
  );
}

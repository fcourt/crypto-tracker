export const PERIODS = [
  { id: 'all',   label: 'Tout' },
  { id: 'month', label: 'Ce mois' },
  { id: 'week',  label: 'Cette semaine' },
];

export function getDateRange(periodId) {
  const now = new Date();
  if (periodId === 'week') {
    const start = new Date(now);
    const day = start.getDay() || 7; // lundi = 1
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  }
  if (periodId === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start, to: now };
  }
  return { from: null, to: null };
}

export default function PeriodFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-medium">Période :</span>
      <div className="flex gap-1">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              value === p.id
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

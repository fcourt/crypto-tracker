const PLATFORMS = [
  { id: 'all', label: 'Tous', color: 'blue' },
  { id: 'hyperliquid', label: 'Hyperliquid', color: 'green' },
  { id: 'xyz', label: 'trade.xyz', color: 'purple' },
  { id: 'hyena', label: 'HyENA', color: 'orange' },
];

export default function PlatformTabs({ active, onChange, countByPlatform }) {
  return (
    <div className="flex gap-2 px-4 overflow-x-auto">
      {PLATFORMS.map(p => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
            ${active === p.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          {p.label}
          {countByPlatform[p.id] !== undefined && (
            <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
              {countByPlatform[p.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

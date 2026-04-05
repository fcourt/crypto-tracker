import { useState } from 'react';

export default function DropSection({ title, defaultOpen = false, badge = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="font-semibold flex items-center gap-2">
          {title}
          {badge != null && (
            <span className="text-xs bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">{badge}</span>
          )}
        </span>
        <span className="text-gray-600">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="border-t border-gray-700/60">{children}</div>}
    </div>
  );
}

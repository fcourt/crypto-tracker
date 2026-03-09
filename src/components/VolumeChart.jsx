import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { groupVolumeByDay } from '../utils/platformFilter';

const fmtUSD = (v) => `$${new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)}`;

export default function VolumeChart({ fills }) {
  const data = groupVolumeByDay(fills);

  if (data.length === 0) return null;

  return (
    <div className="mx-4 bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Volume par jour</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} />
          <YAxis tickFormatter={fmtUSD} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v) => [`$${new Intl.NumberFormat('fr-FR').format(v)}`, 'Volume']}
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Area type="monotone" dataKey="volume" stroke="#3b82f6" fill="url(#volGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

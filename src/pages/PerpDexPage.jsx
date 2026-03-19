import { useState } from 'react';
import PerpDexCard from '../components/PerpDexCard';
import PeriodFilter, { getDateRange } from '../components/PeriodFilter';

const CARD_COUNT = 2;

export default function PerpDexPage() {
  const [period, setPeriod] = useState('all');
  const dateRange = getDateRange(period);

  return (
    <div className="px-4 pb-8 flex flex-col gap-4">

      {/* Barre filtre période */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
          Perp DEX
        </h2>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {/* Cartes */}
      {Array.from({ length: CARD_COUNT }).map((_, i) => (
        <PerpDexCard key={i} cardIndex={i} dateRange={dateRange} />
      ))}

    </div>
  );
}

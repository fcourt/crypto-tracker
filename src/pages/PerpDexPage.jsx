import { useState } from 'react';
import PerpDexCard from '../components/PerpDexCard';
import PerpDexSummary from '../components/PerpDexSummary';
import PeriodFilter, { getDateRange } from '../components/PeriodFilter';

export default function PerpDexPage() {
  const [cardsData, setCardsData] = useState([null, null, null, null]);
  const [period, setPeriod]       = useState({ type: 'all' });

  const dateRange = getDateRange(period);

  const handleDataChange = (cardIndex, data) => {
    setCardsData(prev => {
      const next = [...prev];
      next[cardIndex] = data;
      return next;
    });
  };

  return (
    <div className="space-y-4 pb-8">

      {/* Filtre période */}
      <div className="px-4 pt-2">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {/* 4 cartes — 2 par ligne */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        {[0, 1, 2, 3].map(i => (
          <PerpDexCard
            key={i}
            cardIndex={i}
            onDataChange={handleDataChange}
            dateRange={dateRange}
          />
        ))}
      </div>

      {/* Carte synthèse */}
      <div className="px-4">
        <PerpDexSummary cardsData={cardsData} />
      </div>

    </div>
  );
}

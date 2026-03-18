import { useState } from 'react';
import PerpDexCard from '../components/PerpDexCard';
import PerpDexSummary from '../components/PerpDexSummary';

export default function PerpDexPage() {
  const [cardsData, setCardsData] = useState([null, null, null, null]);

  const handleDataChange = (cardIndex, data) => {
    setCardsData(prev => {
      const next = [...prev];
      next[cardIndex] = data;
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-8">
      {/* 4 cartes en grille */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        {[0, 1, 2, 3].map(i => (
          <PerpDexCard
            key={i}
            cardIndex={i}
            onDataChange={handleDataChange}
          />
        ))}
      </div>

      {/* Carte de synthèse */}
      <div className="px-4">
        <PerpDexSummary cardsData={cardsData} />
      </div>
    </div>
  );
}

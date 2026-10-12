import React from 'react';

export default function CardVisibilityTabs({ view, onChange, allCount, hiddenCount }) {
  return (
    <div className="card-visibility-tabs" role="group" aria-label="Card visibility">
      <button className={view === 'all' ? 'active' : ''} type="button" aria-pressed={view === 'all'} onClick={() => onChange('all')}>
        All <span>{allCount}</span>
      </button>
      <button className={view === 'hidden' ? 'active' : ''} type="button" aria-pressed={view === 'hidden'} onClick={() => onChange('hidden')}>
        Hidden <span>{hiddenCount}</span>
      </button>
    </div>
  );
}
import { useEffect, useState } from 'react';

export default function useHiddenCards(collection) {
  const storageKey = `projectnote-hidden-${collection}`;
  const [hiddenIds, setHiddenIds] = useState(() => {
    try {
      const savedIds = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      return new Set(Array.isArray(savedIds) ? savedIds.map(String) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...hiddenIds]));
    } catch {
      // Hiding still works for the current session when storage is unavailable.
    }
  }, [hiddenIds, storageKey]);

  const hideCard = id => setHiddenIds(current => new Set([...current, String(id)]));
  const restoreCard = id => setHiddenIds(current => {
    const next = new Set(current);
    next.delete(String(id));
    return next;
  });

  return { hiddenIds, hideCard, restoreCard, forgetCard: restoreCard };
}
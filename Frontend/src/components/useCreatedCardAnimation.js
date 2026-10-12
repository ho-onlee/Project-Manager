import { useEffect, useRef, useState } from 'react';

export default function useCreatedCardAnimation(collection) {
  const [createdCardIds, setCreatedCardIds] = useState(new Set());
  const timers = useRef(new Map());

  useEffect(() => () => {
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  const highlightCreatedCard = id => {
    const cardId = String(id);
    const previousTimer = timers.current.get(cardId);
    if (previousTimer) window.clearTimeout(previousTimer);
    setCreatedCardIds(current => new Set([...current, cardId]));
    window.requestAnimationFrame(() => {
      const card = document.getElementById(`${collection}-card-${cardId}`);
      card?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
    });
    timers.current.set(cardId, window.setTimeout(() => {
      setCreatedCardIds(current => {
        const next = new Set(current);
        next.delete(cardId);
        return next;
      });
      timers.current.delete(cardId);
    }, 1800));
  };

  return { createdCardIds, highlightCreatedCard };
}
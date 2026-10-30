import { useEffect, useRef } from 'react';

const isTypingTarget = target => target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

export default function useDeleteKey(onDelete) {
  const handlerRef = useRef(onDelete);
  handlerRef.current = onDelete;

  useEffect(() => {
    const listener = event => {
      if (event.key !== 'Delete' || isTypingTarget(event.target)) return;
      handlerRef.current();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

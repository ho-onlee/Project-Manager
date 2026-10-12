import React, { useEffect, useId, useRef, useState } from 'react';

export default function CardActions({ name, hidden, onHide, onRestore, onEdit, onRemove, shareable = false, shareOnly = false, teams = [], sharedWith = [], onShareChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = event => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const runAction = (event, action) => {
    event.stopPropagation();
    setOpen(false);
    action();
  };

  return (
    <div className="card-overflow-actions" ref={containerRef}>
      <button
        className="card-overflow-trigger"
        ref={triggerRef}
        type="button"
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="More actions"
        onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
      >…</button>
      {open && <div className="card-overflow-menu" id={menuId} role="menu" aria-label={`${name} actions`}>
        {!shareOnly && (hidden
          ? <button type="button" role="menuitem" onClick={event => runAction(event, onRestore)}>Show</button>
          : <button type="button" role="menuitem" onClick={event => runAction(event, onHide)}>Hide</button>)}
        {!shareOnly && <button type="button" role="menuitem" onClick={event => runAction(event, onEdit)}>Edit</button>}
        {shareable && teams.length > 0 && <div className="card-share-menu" role="group" aria-label={`Share ${name} with teams`} onClick={event => event.stopPropagation()}>
          <span>Share with team</span>
          {teams.map(team => <label key={team.id}><input type="checkbox" checked={sharedWith.includes(team.id)} onChange={event => onShareChange(team.id, event.target.checked)} /><span>{team.name}</span></label>)}
        </div>}
        {!shareOnly && <button className="is-destructive" type="button" role="menuitem" onClick={event => runAction(event, onRemove)}>Remove</button>}
      </div>}
    </div>
  );
}
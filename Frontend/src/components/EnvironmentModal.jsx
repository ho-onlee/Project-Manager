import React, { useState } from 'react';

export default function EnvironmentModal({ environment, onClose, onSave, onDelete }) {
  const isEditing = Boolean(environment);
  const [name, setName] = useState(environment?.name || '');
  const [description, setDescription] = useState(environment?.description || '');

  const submit = event => {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="modal-backdrop">
      <form className="device-modal compact-modal" onSubmit={submit}>
        <div className="modal-header"><div><p className="eyebrow">{isEditing ? 'Inspect / edit' : 'New environment'}</p><h2>{isEditing ? 'Edit environment' : 'Add an environment'}</h2></div><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <label>Title<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Production workspace" /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Where does this work happen?" /></label>
        <div className="modal-actions">{isEditing && <button type="button" className="delete-button" onClick={() => onDelete(environment.id)}>Delete</button>}<button type="button" className="quiet-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim()}>{isEditing ? 'Save changes' : 'Add environment'}</button></div>
      </form>
    </div>
  );
}

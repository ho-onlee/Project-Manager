import React, { useState } from 'react';

export default function SkillModal({ skill, onClose, onCreate, onDelete }) {
  const isEditing = Boolean(skill);
  const [name, setName] = useState(skill?.name || '');
  const [description, setDescription] = useState(skill?.description || '');
  const submit = event => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() || 'A new capability.' });
  };

  return (
    <div className="modal-backdrop">
      <form className="device-modal compact-modal" onSubmit={submit}>
        <div className="modal-header"><div><p className="eyebrow">{isEditing ? 'Inspect / edit' : 'New capability'}</p><h2>{isEditing ? 'Edit skill' : 'Add a skill'}</h2></div><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <label>Name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Questionnaire: Likert Scale" /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What can this skill do?" /></label>
        <div className="modal-actions">{isEditing && <button type="button" className="delete-button" onClick={() => onDelete(skill.id)}>Delete</button>}<button type="button" className="quiet-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim()}>{isEditing ? 'Save changes' : 'Add skill'}</button></div>
      </form>
    </div>
  );
}

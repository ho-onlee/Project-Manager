import React, { useState } from 'react';

export default function ProjectGroupModal({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = event => {
    event.preventDefault();
    if (title.trim()) onSave({ title: title.trim(), description: description.trim() });
  };

  return (
    <div className="modal-backdrop">
      <form className="device-modal compact-modal" onSubmit={submit}>
        <div className="modal-header"><div><p className="eyebrow">New collection</p><h2>Create a project group</h2></div><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <label>Title<input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Coastal restoration" /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What connects these projects?" /></label>
        <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim()}>Create group</button></div>
      </form>
    </div>
  );
}

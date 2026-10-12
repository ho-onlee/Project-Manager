import React, { useState } from 'react';

export default function ProjectModal({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = event => {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() });
  };

  return (
    <div className="modal-backdrop">
      <form className="device-modal compact-modal" onSubmit={submit}>
        <div className="modal-header"><div><p className="eyebrow">New project</p><h2>Add a project</h2></div><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <label>Title<input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Launch a research study" /></label>
        <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What is this project about?" /></label>
        <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim()}>Add project</button></div>
      </form>
    </div>
  );
}

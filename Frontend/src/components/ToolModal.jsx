import React, { useMemo, useState } from 'react';
import SkillModal from './SkillModal';

export default function ToolModal({ skills, tool, onClose, onCreate, onDelete }) {
  const isEditing = Boolean(tool);
  const [availableSkills, setAvailableSkills] = useState(skills);
  const [name, setName] = useState(tool?.name || '');
  const [description, setDescription] = useState(tool?.description || '');
  const [features, setFeatures] = useState(tool?.features?.join(', ') || '');
  const [skillQuery, setSkillQuery] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState(tool?.skillIds || []);
  const [creatingSkill, setCreatingSkill] = useState(false);
  const matches = useMemo(() => availableSkills.filter(skill => skill.name.toLowerCase().includes(skillQuery.toLowerCase())), [availableSkills, skillQuery]);
  const selectedSkills = availableSkills.filter(skill => selectedSkillIds.includes(skill.id));

  const submit = event => {
    event.preventDefault();
    if (!name.trim() || !selectedSkills.length) return;
    onCreate({ name: name.trim(), description: description.trim() || 'A new device for this workspace.', features: features.split(',').map(feature => feature.trim()).filter(Boolean) }, selectedSkills, tool?.id);
  };

  return <>
    <div className="modal-backdrop"><form className="device-modal" onSubmit={submit}>
    <div className="modal-header"><div><p className="eyebrow">{isEditing ? 'Inspect / edit' : 'New device'}</p><h2>{isEditing ? 'Edit tool' : 'Create a tool'}</h2></div><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
    <label>Name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Interview Kit" /></label>
    <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What does this device help you do?" /></label>
    <label>Features <span className="hint">comma separated</span><input value={features} onChange={event => setFeatures(event.target.value)} placeholder="Prompts, scoring, export" /></label>
    <div className="skill-picker"><p className="eyebrow">Skills <span className="hint">select one or more</span></p><input value={skillQuery} onChange={event => setSkillQuery(event.target.value)} placeholder="Search your skills" />
      <div className="skill-results" role="listbox" aria-label="Available skills" aria-multiselectable="true">
        <button type="button" className="create-skill-result" onClick={() => setCreatingSkill(true)}><strong>＋ Create a new skill</strong><span>Open the skill creation form</span></button>
        {matches.map(skill => <button type="button" className={`skill-result ${selectedSkillIds.includes(skill.id) ? 'selected' : ''}`} key={skill.id} onClick={() => { setSelectedSkillIds(current => current.includes(skill.id) ? current.filter(id => id !== skill.id) : [...current, skill.id]); }}><strong>{skill.name}</strong><span>{skill.description}</span></button>)}
      </div>{selectedSkills.length > 0 && <div className="selected-skill">Selected: <strong>{selectedSkills.map(skill => skill.name).join(', ')}</strong></div>}
    </div>
    <div className="modal-actions">{isEditing && <button type="button" className="delete-button" onClick={() => onDelete(tool.id)}>Delete</button>}<button type="button" className="quiet-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim() || !selectedSkills.length}>{isEditing ? 'Save changes' : 'Create device'}</button></div>
  </form></div>
  {creatingSkill && <SkillModal onClose={() => setCreatingSkill(false)} onCreate={skill => { const created = { ...skill, id: `skill-${crypto.randomUUID()}`, toolIds: [] }; setAvailableSkills(current => [...current, created]); setSelectedSkillIds(current => [...current, created.id]); setSkillQuery(''); setCreatingSkill(false); }} />}
  </>;
}

import React from 'react';
import CatalogCard from './CatalogCard';

export default function SkillCard({ id, skill, tools, hidden, highlighted, onHide, onRestore, onRemove, onEdit, teams = [], onShareChange }) {
  return (
    <CatalogCard id={id} label="SKILL" name={skill.name} description={skill.description} hidden={hidden} highlighted={highlighted} onHide={onHide} onRestore={onRestore} onRemove={onRemove} onEdit={() => onEdit(skill)} teams={teams} sharedWith={(skill.shared_with || []).map(String)} onShareChange={onShareChange && ((teamId, shared) => onShareChange(skill, teamId, shared))}>
      {skill.toolIds.length > 0 && <div className="linked-tools">{skill.toolIds.map(id => <span key={id}>{tools.find(tool => tool.id === id)?.name || 'Unknown tool'}</span>)}</div>}
    </CatalogCard>
  );
}

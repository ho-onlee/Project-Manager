import React from 'react';
import CatalogCard from './CatalogCard';

export default function ToolCard({ id, tool, skills, hidden, highlighted, onHide, onRestore, onRemove, onEdit, teams = [], onShareChange }) {
  const toolId = String(tool.id);
  const linkedSkillIds = new Set((tool.skillIds || []).map(String));
  const linkedSkills = skills.filter(skill => linkedSkillIds.has(String(skill.id)) || (skill.toolIds || []).map(String).includes(toolId));
  return (
    <CatalogCard id={id} variant="tool" label="DEVICE" name={tool.name} description={tool.description} hidden={hidden} highlighted={highlighted} onHide={onHide} onRestore={onRestore} onRemove={onRemove} onEdit={() => onEdit(tool)} teams={teams} sharedWith={(tool.shared_with || []).map(String)} onShareChange={onShareChange && ((teamId, shared) => onShareChange(tool, teamId, shared))}>
      <ul className="tool-features">{tool.features.map(feature => <li key={feature} title={feature}>{feature}</li>)}</ul>
      <div className="skill-list">
        {linkedSkills.map(skill => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}
      </div>
    </CatalogCard>
  );
}

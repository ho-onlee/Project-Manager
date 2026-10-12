import React, { useEffect, useState } from 'react';
import SkillCard from './SkillCard';
import SkillModal from './SkillModal';
import FloatingAction from './FloatingAction';
import CardVisibilityTabs from './CardVisibilityTabs';
import CatalogSearch from './CatalogSearch';
import useHiddenCards from './useHiddenCards';
import useCreatedCardAnimation from './useCreatedCardAnimation';
import { createSkillAPI, deleteSkillAPI, fetchSkills, fetchTools, updateSharedCardAPI, updateSkillAPI } from '../api';

export default function SkillView({ teams = [], activeWorkspaceId }) {
  const [skills, setSkills] = useState([]);
  const [tools, setTools] = useState([]);
  const [addMode, setAddMode] = useState(null);
  const [cardView, setCardView] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { hiddenIds, hideCard, restoreCard, forgetCard } = useHiddenCards('skills');
  const { createdCardIds, highlightCreatedCard } = useCreatedCardAnimation('skills');

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [skillsResponse, toolsResponse] = await Promise.all([fetchSkills(), fetchTools()]);
        setSkills(skillsResponse.data.results || skillsResponse.data);
        setTools(toolsResponse.data.results || toolsResponse.data);
      } catch (error) {
        console.error('Failed to load skills and tools:', error);
      }
    };
    loadCatalog();
  }, []);

  const saveSkill = async (updates, skillId) => {
    const response = await updateSkillAPI(skillId, updates);
    setSkills(current => current.map(skill => skill.id === skillId ? { ...skill, ...response.data } : skill));
    setAddMode(null);
  };

  const shareSkill = async (skill, teamId, shouldShare) => {
    const sharedWith = new Set((skill.shared_with || []).map(String));
    if (shouldShare) sharedWith.add(String(teamId)); else sharedWith.delete(String(teamId));
    const response = await updateSharedCardAPI('skills', skill.id, [...sharedWith]);
    setSkills(current => current.map(item => item.id === skill.id ? response.data : item));
  };

  const deleteSkill = async skillId => {
    const soleSkillTool = tools.find(tool => tool.skillIds.length === 1 && tool.skillIds[0] === skillId);
    if (soleSkillTool) {
      window.alert(`Cannot delete this skill because ${soleSkillTool.name} must have at least one skill.`);
      return;
    }
    await deleteSkillAPI(skillId);
    setSkills(current => current.filter(skill => skill.id !== skillId));
    setTools(current => current.map(tool => ({ ...tool, skillIds: tool.skillIds.filter(id => id !== skillId) })));
    setAddMode(null);
  };

  const addStandaloneSkill = async skill => {
    const response = await createSkillAPI(skill);
    setSkills(current => [...current, response.data]);
    setCardView('all');
    setSearchQuery('');
    highlightCreatedCard(response.data.id);
    setAddMode(null);
  };

  const removeSkillFromCard = async skillId => {
    const skill = skills.find(item => String(item.id) === String(skillId));
    if (!skill) return;
    const soleSkillTool = tools.find(tool => tool.skillIds.length === 1 && tool.skillIds[0] === skillId);
    if (soleSkillTool) {
      window.alert(`Cannot delete this skill because ${soleSkillTool.name} must have at least one skill.`);
      return;
    }
    if (!window.confirm(`Remove "${skill.name}"? This cannot be undone.`)) return;
    await deleteSkill(skillId);
    forgetCard(skillId);
  };

  const hiddenSkillsCount = skills.filter(skill => hiddenIds.has(String(skill.id))).length;
  const displayedSkills = skills.filter(skill => hiddenIds.has(String(skill.id)) === (cardView === 'hidden'));
  const query = searchQuery.trim().toLowerCase();
  const filteredSkills = displayedSkills.filter(skill => !query || [skill.name, skill.description].some(value => String(value || '').toLowerCase().includes(query)));

  return (
    <>
      <section className="catalog-view">
        <div className="catalog-toolbar">
          <CatalogSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search skills" />
          <CardVisibilityTabs view={cardView} onChange={setCardView} allCount={skills.length - hiddenSkillsCount} hiddenCount={hiddenSkillsCount} />
        </div>
        <div className="catalog-grid">
          {filteredSkills.map(skill => <SkillCard id={`skills-card-${skill.id}`} key={skill.id} skill={skill} tools={tools} teams={skill.workspace === activeWorkspaceId ? teams : []} onShareChange={shareSkill} hidden={cardView === 'hidden'} highlighted={createdCardIds.has(String(skill.id))} onHide={() => hideCard(skill.id)} onRestore={() => restoreCard(skill.id)} onRemove={() => removeSkillFromCard(skill.id)} onEdit={skillToEdit => setAddMode({ type: 'edit-skill', item: skillToEdit })} />)}
        </div>
        {!filteredSkills.length && <p className="hidden-cards-empty">{query ? `No skills match "${searchQuery.trim()}".` : cardView === 'hidden' ? 'No hidden skills.' : 'No skills yet.'}</p>}
      </section>
      {addMode === 'skill' && <SkillModal onClose={() => setAddMode(null)} onCreate={addStandaloneSkill} />}
      {addMode?.type === 'edit-skill' && <SkillModal skill={addMode.item} onClose={() => setAddMode(null)} onCreate={updates => saveSkill(updates, addMode.item.id)} onDelete={deleteSkill} />}
      <FloatingAction activeView="skills" onClick={() => setAddMode('skill')} />
    </>
  );
}

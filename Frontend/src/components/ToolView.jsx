import React, { useEffect, useState } from 'react';
import ToolCard from './ToolCard';
import ToolModal from './ToolModal';
import FloatingAction from './FloatingAction';
import CardVisibilityTabs from './CardVisibilityTabs';
import CatalogSearch from './CatalogSearch';
import useHiddenCards from './useHiddenCards';
import useCreatedCardAnimation from './useCreatedCardAnimation';
import { createSkillAPI, createToolAPI, deleteToolAPI, fetchSkills, fetchTools, updateSharedCardAPI, updateToolAPI } from '../api';

export default function ToolView({ teams = [], activeWorkspaceId }) {
  const [tools, setTools] = useState([]);
  const [skills, setSkills] = useState([]);
  const [addMode, setAddMode] = useState(null);
  const [cardView, setCardView] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { hiddenIds, hideCard, restoreCard, forgetCard } = useHiddenCards('tools');
  const { createdCardIds, highlightCreatedCard } = useCreatedCardAnimation('tools');

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [toolsResponse, skillsResponse] = await Promise.all([fetchTools(), fetchSkills()]);
        setTools(toolsResponse.data.results || toolsResponse.data);
        setSkills(skillsResponse.data.results || skillsResponse.data);
      } catch (error) {
        console.error('Failed to load tools and skills:', error);
      }
    };
    loadCatalog();
  }, []);

  const addTool = async (tool, selectedSkills) => {
    const persistedSkills = await Promise.all(selectedSkills.map(async skill => skills.some(item => item.id === skill.id) ? skill : (await createSkillAPI({ name: skill.name, description: skill.description })).data));
    const response = await createToolAPI({ ...tool, skillIds: persistedSkills.map(skill => skill.id) });
    setSkills(current => [...current, ...persistedSkills.filter(skill => !current.some(item => item.id === skill.id))]);
    setTools(current => [...current, response.data]);
    setCardView('all');
    setSearchQuery('');
    highlightCreatedCard(response.data.id);
    setAddMode(null);
  };

  const addSkillToTool = (toolId, skill) => {
    const skillId = `skill-${crypto.randomUUID()}`;
    setSkills(current => [...current, { ...skill, id: skillId, toolIds: [toolId] }]);
    setTools(current => current.map(tool => tool.id === toolId ? { ...tool, skillIds: [...tool.skillIds, skillId] } : tool));
  };

  const saveTool = async (updates, selectedSkills, toolId) => {
    const persistedSkills = await Promise.all(selectedSkills.map(async skill => skills.some(item => item.id === skill.id) ? skill : (await createSkillAPI({ name: skill.name, description: skill.description })).data));
    const response = await updateToolAPI(toolId, { ...updates, skillIds: persistedSkills.map(skill => skill.id) });
    setTools(current => current.map(tool => tool.id === toolId ? response.data : tool));
    setSkills(current => {
      const linkedSkills = current.map(skill => ({ ...skill, toolIds: skill.toolIds.filter(id => id !== toolId) }));
      return persistedSkills.reduce((catalog, selectedSkill) => {
        const existingSkill = catalog.find(skill => skill.id === selectedSkill.id);
        if (existingSkill) {
          existingSkill.toolIds = [...new Set([...existingSkill.toolIds, toolId])];
          return catalog;
        }
        return [...catalog, { ...selectedSkill, toolIds: [toolId] }];
      }, linkedSkills);
    });
    setAddMode(null);
  };

  const deleteTool = async toolId => {
    await deleteToolAPI(toolId);
    setTools(current => current.filter(tool => tool.id !== toolId));
    setSkills(current => current.map(skill => ({ ...skill, toolIds: skill.toolIds.filter(id => id !== toolId) })));
    setAddMode(null);
  };

  const shareTool = async (tool, teamId, shouldShare) => {
    const sharedWith = new Set((tool.shared_with || []).map(String));
    if (shouldShare) sharedWith.add(String(teamId)); else sharedWith.delete(String(teamId));
    const response = await updateSharedCardAPI('tools', tool.id, [...sharedWith]);
    setTools(current => current.map(item => item.id === tool.id ? response.data : item));
  };

  const removeToolFromCard = async toolId => {
    const tool = tools.find(item => String(item.id) === String(toolId));
    if (!tool || !window.confirm(`Remove "${tool.name}"? This cannot be undone.`)) return;
    await deleteTool(toolId);
    forgetCard(toolId);
  };

  const hiddenToolsCount = tools.filter(tool => hiddenIds.has(String(tool.id))).length;
  const displayedTools = tools.filter(tool => hiddenIds.has(String(tool.id)) === (cardView === 'hidden'));
  const query = searchQuery.trim().toLowerCase();
  const filteredTools = displayedTools.filter(tool => !query || [tool.name, tool.description, ...(tool.features || [])].some(value => String(value || '').toLowerCase().includes(query)));

  return (
    <>
      <section className="catalog-view">
        <div className="catalog-toolbar">
          <CatalogSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search tools" />
          <CardVisibilityTabs view={cardView} onChange={setCardView} allCount={tools.length - hiddenToolsCount} hiddenCount={hiddenToolsCount} />
        </div>
        <div className="catalog-grid">
          {filteredTools.map(tool => <ToolCard id={`tools-card-${tool.id}`} key={tool.id} tool={tool} skills={skills} teams={tool.workspace === activeWorkspaceId ? teams : []} onShareChange={shareTool} hidden={cardView === 'hidden'} highlighted={createdCardIds.has(String(tool.id))} onHide={() => hideCard(tool.id)} onRestore={() => restoreCard(tool.id)} onRemove={() => removeToolFromCard(tool.id)} onAddSkill={addSkillToTool} onEdit={toolToEdit => setAddMode({ type: 'edit-tool', item: toolToEdit })} />)}
        </div>
        {!filteredTools.length && <p className="hidden-cards-empty">{query ? `No tools match "${searchQuery.trim()}".` : cardView === 'hidden' ? 'No hidden tools.' : 'No tools yet.'}</p>}
      </section>
      {addMode === 'tool' && <ToolModal skills={skills} onClose={() => setAddMode(null)} onCreate={addTool} />}
      {addMode?.type === 'edit-tool' && <ToolModal skills={skills} tool={addMode.item} onClose={() => setAddMode(null)} onCreate={saveTool} onDelete={deleteTool} />}
      <FloatingAction activeView="tools" onClick={() => setAddMode('tool')} />
    </>
  );
}

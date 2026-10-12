import React, { useEffect, useMemo, useState } from 'react';
import { createProjectGroupAPI, deleteProjectGroupAPI, fetchProjectGroupsAPI, fetchProjects } from '../api';
import FloatingAction from './FloatingAction';
import CatalogSearch from './CatalogSearch';
import ProjectGroupModal from './ProjectGroupModal';
import ProjectGroupDiagram from './ProjectGroupDiagram';

export default function ProjectGroupsView() {
  const [groups, setGroups] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [groupResponse, projectResponse] = await Promise.all([fetchProjectGroupsAPI(), fetchProjects()]);
      setGroups(groupResponse.data);
      setProjects(projectResponse.data);
      setError('');
    } catch {
      setError('Project groups could not be loaded. Check that Django is running.');
    }
  };

  useEffect(() => { loadData(); }, []);

  const createGroup = async values => {
    try {
      const response = await createProjectGroupAPI(values);
      setGroups(current => [response.data, ...current]);
      setModalOpen(false);
      setActiveGroup(response.data);
    } catch {
      setError('Project group could not be created.');
    }
  };

  const removeGroup = async (event, group) => {
    event.stopPropagation();
    if (!window.confirm(`Delete “${group.title}” and its canvas items? Projects in the group will not be deleted.`)) return;
    try {
      await deleteProjectGroupAPI(group.id);
      setGroups(current => current.filter(item => item.id !== group.id));
    } catch {
      setError('Project group could not be deleted.');
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const visibleGroups = useMemo(() => groups.filter(group => !query || [group.title, group.description].some(value => String(value || '').toLowerCase().includes(query))), [groups, query]);

  if (activeGroup) return <ProjectGroupDiagram group={activeGroup} projects={projects} onBack={() => { setActiveGroup(null); loadData(); }} />;

  return (
    <section className="catalog-view project-groups-view">
      <CatalogSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search project groups" />
      {error && <p className="project-error">{error}</p>}
      <div className="project-card-grid">
        {visibleGroups.map(group => <article key={group.id} className="project-card" onDoubleClick={() => setActiveGroup(group)}>
          <div className="card-kicker"><span>Project group</span><span>{group.item_count} items</span></div>
          <h2>{group.title}</h2>
          <p>{group.description || 'No description yet.'}</p>
          <button className="text-action" type="button" onClick={() => setActiveGroup(group)}>Open canvas <span aria-hidden="true">↗</span></button>
          <div className="project-card-actions">
            <button className="project-action-button" type="button" onClick={event => removeGroup(event, group)}>Delete group</button>
          </div>
        </article>)}
        {!visibleGroups.length && !error && <div className="project-empty">{query ? `No groups match “${searchQuery.trim()}”.` : 'Create a group to start combining projects.'}</div>}
      </div>
      {modalOpen && <ProjectGroupModal onClose={() => setModalOpen(false)} onSave={createGroup} />}
      <FloatingAction activeView="project-groups" onClick={() => setModalOpen(true)} />
    </section>
  );
}

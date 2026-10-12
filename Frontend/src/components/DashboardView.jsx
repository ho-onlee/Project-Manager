import React, { useEffect, useState } from 'react';
import { fetchEnvironments, fetchProjectGroupsAPI, fetchProjects, fetchSkills, fetchTools } from '../api';

const dashboardStats = [
  { key: 'projects', label: 'Projects', destination: 'projects', marker: '01' },
  { key: 'groups', label: 'Project groups', destination: 'project-groups', marker: '02' },
  { key: 'tools', label: 'Tools', destination: 'tools', marker: '03' },
  { key: 'skills', label: 'Skills', destination: 'skills', marker: '04' },
  { key: 'environments', label: 'Environments', destination: 'environments', marker: '05' },
];

function itemCount(data) {
  const items = data?.results ?? data;
  return Array.isArray(items) ? items.length : null;
}

export default function DashboardView({ session, onNavigate, onChangeWorkspace, onSessionUpdated = async () => {} }) {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const workspace = session?.workspaces?.find(item => item.id === session.activeWorkspaceId);

  useEffect(() => {
    let active = true;
    const requests = [
      ['projects', fetchProjects],
      ['groups', fetchProjectGroupsAPI],
      ['tools', fetchTools],
      ['skills', fetchSkills],
      ['environments', fetchEnvironments],
    ];

    Promise.all(requests.map(async ([key, fetchItems]) => {
      try {
        const response = await fetchItems();
        return [key, itemCount(response.data)];
      } catch {
        return [key, null];
      }
    })).then(results => {
      if (!active) return;
      setCounts(Object.fromEntries(results));
      setLoading(false);
    });

    return () => { active = false; };
  }, []);

  return <section className="catalog-view dashboard-view">
    <header className="dashboard-heading">
      <div>
        <span className="eyebrow">Workspace overview</span>
        <h1>Dashboard</h1>
      </div>
      <span className="dashboard-workspace">{workspace?.name || 'Your workspace'}</span>
    </header>

    <div className="dashboard-stats" aria-label="Workspace statistics">
      {dashboardStats.map(stat => <button className="dashboard-stat" type="button" key={stat.key} onClick={() => onNavigate(stat.destination)}>
        <span className="dashboard-stat-top"><span>{stat.label}</span><span>{stat.marker}</span></span>
        <strong>{counts[stat.key] ?? (loading ? '…' : '—')}</strong>
        <span className="dashboard-stat-link">Open {stat.label.toLowerCase()} <span aria-hidden="true">↗</span></span>
      </button>)}
    </div>

    <section className="dashboard-shortcuts" aria-label="Quick links">
      <button className="dashboard-shortcut dashboard-shortcut-primary" type="button" onClick={() => onNavigate('projects')}>
        <span className="eyebrow">Default page</span>
        <strong>Projects</strong>
        <span>Go to your project workspace <span aria-hidden="true">↗</span></span>
      </button>
      <button className="dashboard-shortcut" type="button" onClick={() => onNavigate('title')}>
        <span className="eyebrow">ProjectNote</span>
        <strong>Title page</strong>
        <span>Open the title page <span aria-hidden="true">↗</span></span>
      </button>
    </section>

  </section>;
}
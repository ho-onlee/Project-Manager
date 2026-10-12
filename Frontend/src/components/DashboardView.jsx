import React, { useEffect, useState } from 'react';
import { createWorkspaceAPI, fetchEnvironments, fetchProjectGroupsAPI, fetchProjects, fetchSkills, fetchTeamsForSignupAPI, fetchTools, requestWorkspaceAccessAPI } from '../api';

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
  const [teams, setTeams] = useState([]);
  const [requestedTeamIds, setRequestedTeamIds] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [teamBusyId, setTeamBusyId] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState('');
  const [teamError, setTeamError] = useState('');
  const workspace = session?.workspaces?.find(item => item.id === session.activeWorkspaceId);
  const memberships = new Map((session?.workspaces || []).filter(item => item.type === 'team').map(item => [item.id, item]));
  const pendingTeamIds = new Set([...(session?.pendingTeams || []).map(item => item.id), ...requestedTeamIds]);

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

  useEffect(() => {
    let active = true;
    fetchTeamsForSignupAPI().then(response => {
      if (active) setTeams(response.data);
    }).catch(() => {
      if (active) setTeamError('The team directory could not be loaded.');
    });
    return () => { active = false; };
  }, []);

  const createTeam = async event => {
    event.preventDefault();
    setCreatingTeam(true);
    setTeamError('');
    setTeamFeedback('');
    try {
      const response = await createWorkspaceAPI(teamName.trim());
      setTeamName('');
      await onSessionUpdated();
      onChangeWorkspace(response.data.id);
    } catch (requestError) {
      setTeamError(requestError.response?.data?.name?.[0] || requestError.response?.data?.detail || 'The team could not be created.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const requestAccess = async team => {
    setTeamBusyId(team.id);
    setTeamError('');
    setTeamFeedback('');
    try {
      const response = await requestWorkspaceAccessAPI(team.id);
      if (response.data.status === 'pending') setRequestedTeamIds(current => [...new Set([...current, team.id])]);
      setTeamFeedback(response.data.detail);
      onSessionUpdated().catch(() => {});
    } catch (requestError) {
      setTeamError(requestError.response?.data?.detail || 'The access request could not be sent.');
    } finally {
      setTeamBusyId('');
    }
  };

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

    <section className="dashboard-teams" aria-labelledby="dashboard-teams-title">
      <div className="dashboard-teams-heading">
        <div><span className="eyebrow">Create or join</span><h2 id="dashboard-teams-title">Teams</h2></div>
        <p>Create a team, or request access to one. Team admins approve requests.</p>
      </div>
      <form className="dashboard-create-team" onSubmit={createTeam}>
        <label className="visually-hidden" htmlFor="dashboard-new-team">New team name</label>
        <input id="dashboard-new-team" value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="Name your team" maxLength={150} required />
        <button type="submit" disabled={creatingTeam || !teamName.trim()}>{creatingTeam ? 'Creating…' : 'Create team'}</button>
      </form>
      {teams.length > 0 ? <div className="dashboard-team-list">{teams.map(team => {
        const membership = memberships.get(team.id);
        const pending = pendingTeamIds.has(team.id);
        return <article className="dashboard-team-row" key={team.id}>
          <span><strong>{team.name}</strong><small>{membership ? 'Member' : pending ? 'Request pending' : 'Team workspace'}</small></span>
          {membership
            ? <button type="button" disabled={session.activeWorkspaceId === team.id} onClick={() => onChangeWorkspace(team.id)}>{session.activeWorkspaceId === team.id ? 'Current team' : 'Open team'}</button>
            : pending
              ? <span className="dashboard-team-pending">Awaiting approval</span>
              : <button type="button" disabled={teamBusyId === team.id} onClick={() => requestAccess(team)}>{teamBusyId === team.id ? 'Sending…' : 'Request access'}</button>}
        </article>;
      })}</div> : !teamError && <p className="dashboard-teams-empty">No teams have been created yet.</p>}
      {teamFeedback && <p className="settings-message" role="status">{teamFeedback}</p>}
      {teamError && <p className="settings-error" role="alert">{teamError}</p>}
    </section>
  </section>;
}
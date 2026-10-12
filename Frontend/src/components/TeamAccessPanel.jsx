import React, { useEffect, useState } from 'react';
import { createWorkspaceAPI, fetchTeamsForSignupAPI, requestWorkspaceAccessAPI } from '../api';

export default function TeamAccessPanel({ session, activeWorkspaceId, onChangeWorkspace, onSessionUpdated = async () => {} }) {
  const [teams, setTeams] = useState([]);
  const [requestedTeamIds, setRequestedTeamIds] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [teamBusyId, setTeamBusyId] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const memberships = new Map((session?.workspaces || []).filter(item => item.type === 'team').map(item => [item.id, item]));
  const pendingTeamIds = new Set([...(session?.pendingTeams || []).map(item => item.id), ...requestedTeamIds]);

  useEffect(() => {
    let active = true;
    fetchTeamsForSignupAPI().then(response => {
      if (active) setTeams(response.data);
    }).catch(() => {
      if (active) setError('The team directory could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const createTeam = async event => {
    event.preventDefault();
    setCreatingTeam(true);
    setError('');
    setFeedback('');
    try {
      const response = await createWorkspaceAPI(teamName.trim());
      setTeamName('');
      await onSessionUpdated();
      onChangeWorkspace(response.data.id);
    } catch (requestError) {
      setError(requestError.response?.data?.name?.[0] || requestError.response?.data?.detail || 'The team could not be created.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const requestAccess = async team => {
    setTeamBusyId(team.id);
    setError('');
    setFeedback('');
    try {
      const response = await requestWorkspaceAccessAPI(team.id);
      if (response.data.status === 'pending') setRequestedTeamIds(current => [...new Set([...current, team.id])]);
      setFeedback(response.data.detail);
      onSessionUpdated().catch(() => {});
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'The access request could not be sent.');
    } finally {
      setTeamBusyId('');
    }
  };

  return <section className="settings-panel team-access-panel" aria-labelledby="team-access-title">
    <div className="settings-panel-heading">
      <div><span className="eyebrow">Workspaces</span><h2 id="team-access-title">Teams</h2></div>
      <span className="settings-status">{memberships.size} joined</span>
    </div>
    <p className="settings-description">Create a team or request access to one. A team admin approves access requests.</p>
    <form className="team-access-create-form" onSubmit={createTeam}>
      <label htmlFor="settings-new-team">Create a team</label>
      <div><input id="settings-new-team" value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="Team name" maxLength={150} required /><button className="secondary-setting-button" type="submit" disabled={creatingTeam || !teamName.trim()}>{creatingTeam ? 'Creating…' : 'Create'}</button></div>
    </form>
    <div className="team-access-directory" aria-label="Available teams">
      <span className="team-access-label">Available teams</span>
      {teams.map(team => {
        const membership = memberships.get(team.id);
        const pending = pendingTeamIds.has(team.id);
        return <article className="team-access-row" key={team.id}>
          <span><strong>{team.name}</strong><small>{membership ? 'Member' : pending ? 'Request pending' : 'Team workspace'}</small></span>
          {membership
            ? <button className="secondary-setting-button" type="button" disabled={activeWorkspaceId === team.id} onClick={() => onChangeWorkspace(team.id)}>{activeWorkspaceId === team.id ? 'Current' : 'Open'}</button>
            : pending
              ? <span className="team-access-pending">Awaiting approval</span>
              : <button className="secondary-setting-button" type="button" disabled={teamBusyId === team.id} onClick={() => requestAccess(team)}>{teamBusyId === team.id ? 'Sending…' : 'Request access'}</button>}
        </article>;
      })}
      {!loading && !error && !teams.length && <p className="team-access-empty">No teams have been created yet.</p>}
      {loading && <p className="team-access-empty">Loading teams…</p>}
    </div>
    {feedback && <p className="settings-message" role="status">{feedback}</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </section>;
}
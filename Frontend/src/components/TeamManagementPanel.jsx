import React, { useCallback, useEffect, useState } from 'react';
import { addWorkspaceMemberAPI, createWorkspaceAPI, fetchWorkspaceMembersAPI, fetchWorkspaceUsersAPI, removeWorkspaceMemberAPI } from '../api';

export default function TeamManagementPanel({ session, activeWorkspaceId, onSessionUpdated }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [busyUserId, setBusyUserId] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const activeWorkspace = session?.workspaces?.find(workspace => workspace.id === activeWorkspaceId);
  const canManageTeam = activeWorkspace?.type === 'team' && ['owner', 'admin'].includes(activeWorkspace.role);

  const loadMembers = useCallback(async () => {
    if (!canManageTeam) return;
    try {
      const response = await fetchWorkspaceMembersAPI(activeWorkspaceId);
      setMembers(response.data);
      setError('');
    } catch {
      setError('Team members could not be loaded.');
    }
  }, [activeWorkspaceId, canManageTeam]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (!canManageTeam || search.trim().length < 2) {
      setAvailableUsers([]);
      return;
    }
    let active = true;
    fetchWorkspaceUsersAPI(activeWorkspaceId, search.trim()).then(response => {
      if (active) setAvailableUsers(response.data);
    }).catch(() => { if (active) setAvailableUsers([]); });
    return () => { active = false; };
  }, [activeWorkspaceId, canManageTeam, search]);

  const addUser = async userId => {
    setBusyUserId(userId);
    setNotice('');
    setError('');
    try {
      await addWorkspaceMemberAPI(activeWorkspaceId, userId);
      setSearch('');
      await loadMembers();
      setNotice('Account added to the team.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Account could not be added.');
    } finally {
      setBusyUserId(null);
    }
  };

  const removeUser = async userId => {
    setBusyUserId(userId);
    setNotice('');
    setError('');
    try {
      await removeWorkspaceMemberAPI(activeWorkspaceId, userId);
      await loadMembers();
      setNotice('Team membership removed.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Team membership could not be removed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const createTeam = async event => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await createWorkspaceAPI(newTeamName.trim());
      setNewTeamName('');
      await onSessionUpdated();
      setNotice('Team created. Switch to it using the workspace selector.');
    } catch (requestError) {
      setError(requestError.response?.data?.name?.[0] || requestError.response?.data?.detail || 'Team could not be created.');
    }
  };

  return (
    <section className="settings-panel team-management-panel" aria-labelledby="team-management-title">
      <div className="settings-panel-heading"><div><span className="eyebrow">Accounts</span><h2 id="team-management-title">Teams and members</h2></div></div>
      {session?.pendingTeams?.length > 0 && <div className="team-pending-list"><strong>Pending team requests</strong>{session.pendingTeams.map(team => <p key={team.id}>{team.name} <span>Waiting for admin approval</span></p>)}</div>}
      {session?.user?.isAdmin && <form className="team-create-form" onSubmit={createTeam}><label htmlFor="new-team-name">Create team</label><div><input id="new-team-name" value={newTeamName} onChange={event => setNewTeamName(event.target.value)} placeholder="Team name" required /><button className="secondary-setting-button" type="submit">Create</button></div></form>}
      {canManageTeam ? <>
        <p className="settings-description">Manage existing accounts in <strong>{activeWorkspace.name}</strong>. Pending signup requests appear here for approval.</p>
        <div className="team-member-list">{members.map(member => <article className="team-member-row" key={member.membershipId}>
          <span><strong>{member.name || member.email}</strong><small>{member.email} · {member.role}</small></span>
          <div>{member.status === 'pending' ? <button className="secondary-setting-button" type="button" disabled={busyUserId === member.userId} onClick={() => addUser(member.userId)}>Approve</button> : <span className="settings-status is-configured">Active</span>}{member.role !== 'owner' && <button className="settings-remove-button" type="button" aria-label={`Remove ${member.email}`} disabled={busyUserId === member.userId} onClick={() => removeUser(member.userId)}>Remove</button>}</div>
        </article>)}</div>
        <label className="team-member-search" htmlFor="team-member-search">Add an existing account<input id="team-member-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by email" /></label>
        {availableUsers.map(user => <button className="team-user-result" key={user.id} type="button" disabled={busyUserId === user.id} onClick={() => addUser(user.id)}><span><strong>{user.name}</strong><small>{user.email}</small></span><span>Add</span></button>)}
      </> : <p className="settings-description">Select a team workspace to manage its members. Only team owners and admins can approve requests or add existing accounts.</p>}
      {notice && <p className="settings-message" role="status">{notice}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </section>
  );
}

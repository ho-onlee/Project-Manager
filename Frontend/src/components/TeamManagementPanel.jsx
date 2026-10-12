import React, { useCallback, useEffect, useState } from 'react';
import { addWorkspaceMemberAPI, createWorkspaceAPI, deleteWorkspaceAPI, fetchProjects, fetchSkills, fetchTools, fetchWorkspaceCardAssignmentsAPI, fetchWorkspaceMembersAPI, fetchWorkspaceUsersAPI, removeWorkspaceMemberAPI, updateWorkspaceCardAssignmentsAPI } from '../api';

export default function TeamManagementPanel({ session, activeWorkspaceId, onSessionUpdated }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [busyUserId, setBusyUserId] = useState(null);
  const [assignmentType, setAssignmentType] = useState('projects');
  const [assignmentCards, setAssignmentCards] = useState([]);
  const [assignmentCardId, setAssignmentCardId] = useState('');
  const [assignmentMembers, setAssignmentMembers] = useState([]);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const activeWorkspace = session?.workspaces?.find(workspace => workspace.id === activeWorkspaceId);
  const canManageTeam = activeWorkspace?.type === 'team' && ['owner', 'admin'].includes(activeWorkspace.role);
  const canDeleteTeam = activeWorkspace?.type === 'team' && (activeWorkspace.role === 'owner' || session?.user?.isAdmin);

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

  useEffect(() => {
    if (!canManageTeam) {
      setAssignmentCards([]);
      setAssignmentCardId('');
      return;
    }
    const loadCards = async () => {
      try {
        const fetchCards = { projects: fetchProjects, tools: fetchTools, skills: fetchSkills }[assignmentType];
        const response = await fetchCards();
        const cards = response.data.results || response.data;
        setAssignmentCards(cards);
        setAssignmentCardId(current => cards.some(card => String(card.id) === current) ? current : String(cards[0]?.id || ''));
      } catch {
        setAssignmentCards([]);
        setAssignmentCardId('');
      }
    };
    loadCards();
  }, [activeWorkspaceId, assignmentType, canManageTeam]);

  useEffect(() => {
    if (!canManageTeam || !assignmentCardId) {
      setAssignmentMembers([]);
      setAssignedUserIds([]);
      return;
    }
    let active = true;
    fetchWorkspaceCardAssignmentsAPI(activeWorkspaceId, assignmentType, assignmentCardId).then(response => {
      if (!active) return;
      setAssignmentMembers(response.data.members);
      setAssignedUserIds(response.data.userIds);
    }).catch(() => {
      if (active) {
        setAssignmentMembers([]);
        setAssignedUserIds([]);
      }
    });
    return () => { active = false; };
  }, [activeWorkspaceId, assignmentCardId, assignmentType, canManageTeam]);

  const saveAssignments = async () => {
    if (!assignmentCardId) return;
    setAssignmentBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await updateWorkspaceCardAssignmentsAPI(activeWorkspaceId, assignmentType, assignmentCardId, assignedUserIds);
      setAssignmentMembers(response.data.members);
      setAssignedUserIds(response.data.userIds);
      setNotice('User assignments saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.response?.data?.userIds?.[0] || 'Assignments could not be saved.');
    } finally {
      setAssignmentBusy(false);
    }
  };

  const toggleAssignee = (userId, checked) => {
    setAssignedUserIds(current => checked ? [...new Set([...current, userId])] : current.filter(id => id !== userId));
  };

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

  const deleteTeam = async () => {
    if (!activeWorkspace || !window.confirm(`Permanently delete “${activeWorkspace.name}”? Its team-owned projects, groups, catalog cards, member access, and team Gemini key will be deleted. Cards merely shared into this team remain in their original workspaces.`)) return;
    setError('');
    setNotice('');
    try {
      await deleteWorkspaceAPI(activeWorkspace.id);
      await onSessionUpdated();
      setNotice(`Team “${activeWorkspace.name}” was deleted. Your personal workspace remains available.`);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Team could not be deleted.');
    }
  };

  return (
    <section className="users-management">
      <div className="users-context-bar">
        <div><span className="eyebrow">Active workspace</span><strong>{activeWorkspace?.name || 'Personal workspace'}</strong></div>
        {canDeleteTeam && <button className="settings-remove-button" type="button" onClick={deleteTeam}>Delete team</button>}
        {session?.user?.isAdmin && <form className="team-create-form" onSubmit={createTeam}><label className="visually-hidden" htmlFor="new-team-name">Create team</label><input id="new-team-name" value={newTeamName} onChange={event => setNewTeamName(event.target.value)} placeholder="New team name" required /><button className="secondary-setting-button" type="submit">Create team</button></form>}
      </div>
      {session?.pendingTeams?.length > 0 && <div className="team-pending-list"><strong>Pending team requests</strong>{session.pendingTeams.map(team => <p key={team.id}>{team.name} <span>Waiting for admin approval</span></p>)}</div>}
      {canManageTeam ? <div className="users-management-grid">
        <section className="settings-panel users-members-panel" aria-labelledby="team-members-title">
          <div className="settings-panel-heading"><div><span className="eyebrow">People</span><h2 id="team-members-title">Members</h2></div><span className="settings-status">{members.filter(member => member.status === 'active').length} active</span></div>
          <p className="settings-description">Approve requests and add existing accounts to this team.</p>
          <div className="team-member-list">{members.map(member => <article className="team-member-row" key={member.membershipId}>
            <span><strong>{member.name || member.email}</strong><small>{member.email} · {member.role}</small></span>
            <div>{member.status === 'pending' ? <button className="secondary-setting-button" type="button" disabled={busyUserId === member.userId} onClick={() => addUser(member.userId)}>Approve</button> : <span className="settings-status is-configured">Active</span>}{member.role !== 'owner' && <button className="settings-remove-button" type="button" aria-label={`Remove ${member.email}`} disabled={busyUserId === member.userId} onClick={() => removeUser(member.userId)}>Remove</button>}</div>
          </article>)}</div>
          <label className="team-member-search" htmlFor="team-member-search">Add existing account<input id="team-member-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by email" /></label>
          {availableUsers.map(user => <button className="team-user-result" key={user.id} type="button" disabled={busyUserId === user.id} onClick={() => addUser(user.id)}><span><strong>{user.name}</strong><small>{user.email}</small></span><span>Add</span></button>)}
        </section>
        <section className="settings-panel users-assignments-panel" aria-labelledby="user-manager-title">
          <div className="settings-panel-heading"><div><span className="eyebrow">Work allocation</span><h2 id="user-manager-title">Assignments</h2></div></div>
          <p className="settings-description">Assign active team members to projects, tools, and skills.</p>
          <div className="assignment-selectors">
            <label>Card type<select value={assignmentType} onChange={event => setAssignmentType(event.target.value)}><option value="projects">Projects</option><option value="tools">Tools</option><option value="skills">Skills</option></select></label>
            <label>Card<select value={assignmentCardId} onChange={event => setAssignmentCardId(event.target.value)}>{assignmentCards.map(card => <option key={card.id} value={card.id}>{card.title || card.name}</option>)}</select></label>
          </div>
          {assignmentCardId ? <div className="assignment-member-list">{assignmentMembers.map(member => <label key={member.id} className="assignment-member-row"><span><strong>{member.name}</strong><small>{member.email}</small></span><input type="checkbox" checked={assignedUserIds.includes(member.id)} onChange={event => toggleAssignee(member.id, event.target.checked)} /></label>)}{!assignmentMembers.length && <p className="settings-description">There are no active team members to assign.</p>}</div> : <p className="settings-description">No {assignmentType} are available in this team workspace.</p>}
          <button className="secondary-setting-button" type="button" disabled={assignmentBusy || !assignmentCardId} onClick={saveAssignments}>{assignmentBusy ? 'Saving…' : 'Save assignments'}</button>
        </section>
      </div> : <p className="users-empty-state">Select a team workspace to manage its members and card assignments.</p>}
      {notice && <p className="settings-message" role="status">{notice}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </section>
  );
}

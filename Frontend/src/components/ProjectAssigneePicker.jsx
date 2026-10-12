import React, { useEffect, useState } from 'react';
import { fetchWorkspaceCardAssignmentsAPI, updateWorkspaceCardAssignmentsAPI } from '../api';

export default function ProjectAssigneePicker({ project, workspaceId }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [assignedIds, setAssignedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    fetchWorkspaceCardAssignmentsAPI(workspaceId, 'projects', project.id).then(response => {
      if (!active) return;
      setMembers(response.data.members);
      setAssignedIds(response.data.userIds);
    }).catch(requestError => {
      if (active) setError(requestError.response?.data?.detail || 'Project assignments could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, project.id, workspaceId]);

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await updateWorkspaceCardAssignmentsAPI(workspaceId, 'projects', project.id, assignedIds);
      setMembers(response.data.members);
      setAssignedIds(response.data.userIds);
      setNotice('Assignments saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.response?.data?.userIds?.[0] || 'Assignments could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="project-assignee-picker">
    <button className="project-action-button" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Close assignments' : 'Assign users'}</button>
    {open && <div className="project-assignee-popover">
      <strong>Assign to this project</strong>
      {loading ? <p className="settings-description">Loading team members…</p> : <div className="project-assignee-list">{members.map(member => <label key={member.id}><span>{member.name}<small>{member.email}</small></span><input type="checkbox" checked={assignedIds.includes(member.id)} onChange={event => setAssignedIds(current => event.target.checked ? [...new Set([...current, member.id])] : current.filter(id => id !== member.id))} /></label>)}{!members.length && <p className="settings-description">No active team members.</p>}</div>}
      <button className="secondary-setting-button" type="button" disabled={loading || saving} onClick={save}>{saving ? 'Saving…' : 'Save assignments'}</button>
      {notice && <p className="settings-message" role="status">{notice}</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </div>}
  </div>;
}

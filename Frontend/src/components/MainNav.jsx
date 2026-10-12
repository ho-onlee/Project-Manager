import React from 'react';

export default function MainNav({ activeView, isOpen, onToggle, onNavigate, workspaces = [], activeWorkspaceId, onChangeWorkspace, onSignOut }) {
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
  return (
    <nav className={`app-nav ${isOpen ? 'is-open' : ''}`} aria-label="Main navigation">
      <button className="menu-button" aria-label="Toggle navigation" onClick={onToggle}>☰</button>
      <div className="nav-brand"><span className="brand-mark">✦</span><span>ProjectNote</span></div>
      <div className="nav-links">
        <NavItem icon="◈" label="Tools" active={activeView === 'tools'} onClick={() => onNavigate('tools')} />
        <NavItem icon="◇" label="Skills" active={activeView === 'skills'} onClick={() => onNavigate('skills')} />
        <NavItem icon="⌂" label="Environments" active={activeView === 'environments'} onClick={() => onNavigate('environments')} />
        <span className="nav-divider" role="separator" aria-orientation="horizontal" />
        <NavItem icon="▣" label="Projects" className="nav-projects" active={activeView === 'projects'} onClick={() => onNavigate('projects')} />
        <NavItem icon="▦" label="Groups" active={activeView === 'project-groups'} onClick={() => onNavigate('project-groups')} />
        <NavItem icon="⚙" label="Settings" className="nav-settings" active={activeView === 'settings'} onClick={() => onNavigate('settings')} />
      </div>
      <div className="nav-account-controls">
          {workspaces.length > 0 && <label className="nav-workspace-picker" data-workspace-mark={activeWorkspace?.type === 'team' ? 'T' : 'P'} title={`Workspace: ${activeWorkspace?.name || 'Select workspace'}`}><span className="eyebrow">Workspace</span><select aria-label={`Active workspace: ${activeWorkspace?.name || 'Select workspace'}`} value={activeWorkspaceId || ''} onChange={event => onChangeWorkspace(event.target.value)}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.type === 'team' ? ' · Team' : ' · Personal'}</option>)}</select></label>}
          <button className="nav-signout" type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </nav>
  );
}

function NavItem({ icon, label, active, onClick, className = '' }) {
  return <button className={`nav-item ${className} ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span><span>{label}</span></button>;
}

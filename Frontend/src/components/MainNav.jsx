import React from 'react';

export default function MainNav({ activeView, isOpen, onToggle, onNavigate }) {
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
    </nav>
  );
}

function NavItem({ icon, label, active, onClick, className = '' }) {
  return <button className={`nav-item ${className} ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span><span>{label}</span></button>;
}

import React from 'react';

export default function FloatingAction({ activeView, onClick }) {
  if (!['tools', 'skills', 'environments', 'projects', 'project-groups'].includes(activeView)) return null;
  const labels = { tools: 'Create a tool', skills: 'Add a skill', environments: 'Add an environment', projects: 'Add a project', 'project-groups': 'Add a project group' };
  return <button className="floating-add" aria-label={labels[activeView]} onClick={onClick}>＋</button>;
}

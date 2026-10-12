import React from 'react';
import SkillView from './SkillView';
import ToolView from './ToolView';
import ProjectsView from './ProjectsView';
import ProjectGroupsView from './ProjectGroupsView';
import EnvironmentView from './EnvironmentView';
import SettingsView from './SettingsView';

export default function AppView({ activeView, colorSchemes, selectedColorSchemeId, onSelectColorScheme, onImportColorScheme, accessibility, onAccessibilityChange }) {
  if (activeView === 'tools') {
    return <ToolView />;
  }
  if (activeView === 'projects') {
    return <ProjectsView />;
  }
  if (activeView === 'project-groups') {
    return <ProjectGroupsView />;
  }
  if (activeView === 'environments') {
    return <EnvironmentView />;
  }
  if (activeView === 'settings') {
    return <SettingsView colorSchemes={colorSchemes} selectedColorSchemeId={selectedColorSchemeId} onSelectColorScheme={onSelectColorScheme} onImportColorScheme={onImportColorScheme} accessibility={accessibility} onAccessibilityChange={onAccessibilityChange} />;
  }
  return <SkillView />;
}

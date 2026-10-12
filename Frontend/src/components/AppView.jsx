import React from 'react';
import SkillView from './SkillView';
import ToolView from './ToolView';
import ProjectsView from './ProjectsView';
import ProjectGroupsView from './ProjectGroupsView';
import EnvironmentView from './EnvironmentView';
import SettingsView from './SettingsView';

export default function AppView({ activeView, colorSchemes, selectedColorSchemeId, onSelectColorScheme, onImportColorScheme, accessibility, onAccessibilityChange, session, activeWorkspaceId, onSessionUpdated, userPreferences, onUpdateUserPreferences }) {
  const teams = session?.workspaces?.filter(workspace => workspace.type === 'team') || [];
  if (activeView === 'tools') {
    return <ToolView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'projects') {
    return <ProjectsView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'project-groups') {
    return <ProjectGroupsView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'environments') {
    return <EnvironmentView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'settings') {
    return <SettingsView session={session} activeWorkspaceId={activeWorkspaceId} onSessionUpdated={onSessionUpdated} userPreferences={userPreferences} onUpdateUserPreferences={onUpdateUserPreferences} colorSchemes={colorSchemes} selectedColorSchemeId={selectedColorSchemeId} onSelectColorScheme={onSelectColorScheme} onImportColorScheme={onImportColorScheme} accessibility={accessibility} onAccessibilityChange={onAccessibilityChange} />;
  }
  return <SkillView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
}

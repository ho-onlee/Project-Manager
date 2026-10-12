import React from 'react';
import SkillView from './SkillView';
import ToolView from './ToolView';
import ProjectsView from './ProjectsView';
import ProjectGroupsView from './ProjectGroupsView';
import EnvironmentView from './EnvironmentView';
import SettingsView from './SettingsView';
import TeamManagementPanel from './TeamManagementPanel';
import DashboardView from './DashboardView';
import TitleView from './TitleView';

export default function AppView({ activeView, onNavigate, colorSchemes, selectedColorSchemeId, onSelectColorScheme, onImportColorScheme, accessibility, onAccessibilityChange, session, activeWorkspaceId, onSessionUpdated, userPreferences, onUpdateUserPreferences }) {
  const teams = session?.workspaces?.filter(workspace => workspace.type === 'team') || [];
  const activeWorkspace = session?.workspaces?.find(workspace => workspace.id === activeWorkspaceId);
  const canManageAssignments = activeWorkspace?.type === 'team' && ['owner', 'admin'].includes(activeWorkspace.role);
  if (activeView === 'dashboard') {
    return <DashboardView session={{ ...session, activeWorkspaceId }} onNavigate={onNavigate} />;
  }
  if (activeView === 'title') {
    return <TitleView onNavigate={onNavigate} />;
  }
  if (activeView === 'tools') {
    return <ToolView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'projects') {
    return <ProjectsView teams={teams} activeWorkspaceId={activeWorkspaceId} canManageAssignments={canManageAssignments} />;
  }
  if (activeView === 'project-groups') {
    return <ProjectGroupsView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'users') {
    return <section className="catalog-view users-view"><TeamManagementPanel session={session} activeWorkspaceId={activeWorkspaceId} onSessionUpdated={onSessionUpdated} /></section>;
  }
  if (activeView === 'environments') {
    return <EnvironmentView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
  }
  if (activeView === 'settings') {
    return <SettingsView session={session} activeWorkspaceId={activeWorkspaceId} onSessionUpdated={onSessionUpdated} userPreferences={userPreferences} onUpdateUserPreferences={onUpdateUserPreferences} colorSchemes={colorSchemes} selectedColorSchemeId={selectedColorSchemeId} onSelectColorScheme={onSelectColorScheme} onImportColorScheme={onImportColorScheme} accessibility={accessibility} onAccessibilityChange={onAccessibilityChange} />;
  }
  return <SkillView teams={teams} activeWorkspaceId={activeWorkspaceId} />;
}

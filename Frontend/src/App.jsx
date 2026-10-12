import React, { useCallback, useEffect, useState } from 'react';
import MainNav from './components/MainNav';
import AppView from './components/AppView';
import AuthView from './components/AuthView';
import { fetchAuthCsrfAPI, fetchAuthSessionAPI, fetchUserPreferencesAPI, logoutAPI, updateUserPreferencesAPI } from './api';
import { readAccessibilitySettings, saveAccessibilitySettings } from './accessibilitySettings';
import { addCustomColorScheme, getInitialColorSchemeState, loadColorSchemes, saveColorSchemeSelection } from './colorSchemes';
import './App.css';

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => window.localStorage.getItem('projectnote-active-workspace'));
  const [userPreferences, setUserPreferences] = useState(null);
  const [colorSchemeState, setColorSchemeState] = useState(getInitialColorSchemeState);
  const [accessibility, setAccessibility] = useState(readAccessibilitySettings);

  const acceptSession = useCallback(nextSession => {
    setSession(nextSession);
    const memberships = nextSession.workspaces || [];
    const storedId = window.localStorage.getItem('projectnote-active-workspace');
    const selected = memberships.find(workspace => workspace.id === storedId) || memberships.find(workspace => workspace.type === 'personal') || memberships[0];
    if (selected) {
      window.localStorage.setItem('projectnote-active-workspace', selected.id);
      setActiveWorkspaceId(selected.id);
      const keyWorkspaceId = memberships.some(workspace => workspace.id === nextSession.geminiWorkspaceId) ? nextSession.geminiWorkspaceId : selected.id;
      window.localStorage.setItem('projectnote-gemini-workspace', keyWorkspaceId);
    } else {
      window.localStorage.removeItem('projectnote-active-workspace');
      window.localStorage.removeItem('projectnote-gemini-workspace');
      setActiveWorkspaceId(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchAuthCsrfAPI().catch(() => {}).finally(() => {
      fetchAuthSessionAPI().then(response => {
        if (active && response.data.authenticated) acceptSession(response.data);
      }).catch(() => {
        if (active) setAuthError('ProjectNote could not reach the API. Start Django on port 8000 and retry.');
      }).finally(() => { if (active) setAuthLoading(false); });
    });
    return () => { active = false; };
  }, [acceptSession]);

  useEffect(() => {
    if (!session?.authenticated) return;
    let active = true;
    fetchUserPreferencesAPI().then(response => {
      if (!active) return;
      setUserPreferences(response.data);
      const keyWorkspaceId = response.data.geminiWorkspaceId || activeWorkspaceId;
      if (keyWorkspaceId) window.localStorage.setItem('projectnote-gemini-workspace', keyWorkspaceId);
      setAccessibility(current => ({ ...current, ...response.data.accessibility }));
      setColorSchemeState(current => {
        const selected = current.schemes.some(scheme => scheme.id === response.data.selectedColorSchemeId)
          ? response.data.selectedColorSchemeId
          : current.defaultSchemeId;
        return { ...current, selectedSchemeId: selected };
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [session?.authenticated, session?.user?.id, activeWorkspaceId]);

  useEffect(() => {
    if (!session?.authenticated) return;
    fetchUserPreferencesAPI().then(response => {
      const currentKeyWorkspace = window.localStorage.getItem('projectnote-gemini-workspace');
      if (!currentKeyWorkspace || !session.workspaces.some(workspace => workspace.id === currentKeyWorkspace)) {
        const preferred = session.workspaces.find(workspace => workspace.id === response.data.geminiWorkspaceId)
          || session.workspaces.find(workspace => workspace.type === 'personal')
          || session.workspaces[0];
        if (preferred) {
          window.localStorage.setItem('projectnote-gemini-workspace', preferred.id);
          if (response.data.geminiWorkspaceId !== preferred.id) updateUserPreferencesAPI({ geminiWorkspaceId: preferred.id }).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [session?.authenticated, session?.user?.id, session?.workspaces]);

  useEffect(() => {
    if (colorSchemeState.definitionsCached) return;
    let active = true;
    loadColorSchemes().then(definitions => {
      if (!active) return;
      const selectedSchemeId = definitions.schemes.some(scheme => scheme.id === colorSchemeState.selectedSchemeId)
        ? colorSchemeState.selectedSchemeId
        : definitions.default;
      if (selectedSchemeId !== colorSchemeState.selectedSchemeId) saveColorSchemeSelection(selectedSchemeId);
      setColorSchemeState({
        schemes: definitions.schemes,
        defaultSchemeId: definitions.default,
        selectedSchemeId,
        definitionsCached: true,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [colorSchemeState.definitionsCached, colorSchemeState.selectedSchemeId]);

  const navigate = view => { setActiveView(view); setNavOpen(false); };

  const changeWorkspace = workspaceId => {
    window.localStorage.setItem('projectnote-active-workspace', workspaceId);
    setActiveWorkspaceId(workspaceId);
    const nextWorkspace = session?.workspaces?.find(workspace => workspace.id === workspaceId);
    if (activeView === 'users' && nextWorkspace?.type !== 'team') setActiveView('projects');
  };

  const refreshSession = useCallback(async () => {
    const response = await fetchAuthSessionAPI();
    if (response.data.authenticated) acceptSession(response.data);
    return response.data;
  }, [acceptSession]);

  const signOut = async () => {
    try { await logoutAPI(); } catch { /* Clear local UI state even if the server session expired. */ }
    window.localStorage.removeItem('projectnote-active-workspace');
    window.localStorage.removeItem('projectnote-gemini-workspace');
    setSession(null);
    setActiveWorkspaceId(null);
    setActiveView('dashboard');
  };

  const selectedScheme = colorSchemeState.schemes.find(scheme => scheme.id === colorSchemeState.selectedSchemeId)
    || colorSchemeState.schemes.find(scheme => scheme.id === colorSchemeState.defaultSchemeId);
  const themeVariables = selectedScheme?.variables
    ? Object.fromEntries(Object.entries(selectedScheme.variables).map(([name, value]) => [name, value]))
    : undefined;

  const appStyle = {
    ...themeVariables,
    '--text-scale': accessibility.textSize === 'largest' ? '1.18' : accessibility.textSize === 'large' ? '1.1' : '1',
    ...(accessibility.highContrast ? {
      '--muted': '#c2ccbd',
      '--line': 'rgba(255, 255, 255, 0.34)',
      '--accent-border': 'var(--lime)',
    } : {}),
  };

  const appClasses = [
    navOpen && 'nav-is-collapsed',
    accessibility.highContrast && 'accessibility-high-contrast',
    accessibility.reduceMotion && 'accessibility-reduce-motion',
  ].filter(Boolean).join(' ');

  const selectColorScheme = schemeId => {
    saveColorSchemeSelection(schemeId);
    setColorSchemeState(current => ({ ...current, selectedSchemeId: schemeId }));
    setUserPreferences(current => current ? { ...current, selectedColorSchemeId: schemeId } : current);
    updateUserPreferencesAPI({ selectedColorSchemeId: schemeId }).catch(() => {});
  };

  const importColorScheme = input => {
    const scheme = addCustomColorScheme(input);
    saveColorSchemeSelection(scheme.id);
    setColorSchemeState(current => ({
      ...current,
      schemes: [...current.schemes.filter(existing => existing.id !== scheme.id), scheme],
      selectedSchemeId: scheme.id,
    }));
    return scheme;
  };

  const updateAccessibility = changes => {
    setAccessibility(current => {
      const next = { ...current, ...changes };
      saveAccessibilitySettings(next);
      setUserPreferences(currentPreferences => currentPreferences ? { ...currentPreferences, accessibility: next } : currentPreferences);
      updateUserPreferencesAPI({ accessibility: next }).catch(() => {});
      return next;
    });
  };

  const updatePreferences = changes => {
    setUserPreferences(current => current ? { ...current, ...changes } : current);
    if (Object.hasOwn(changes, 'geminiWorkspaceId')) {
      if (changes.geminiWorkspaceId) window.localStorage.setItem('projectnote-gemini-workspace', changes.geminiWorkspaceId);
      else window.localStorage.removeItem('projectnote-gemini-workspace');
    }
    updateUserPreferencesAPI(changes).catch(() => {});
  };

  if (authLoading) return <div className="auth-loading">Connecting to ProjectNote…</div>;
  if (!session?.authenticated) return <AuthView onAuthenticated={acceptSession} initialError={authError} />;

  return <div className={`app-shell ${appClasses}`} data-text-size={accessibility.textSize} style={appStyle}>
    <MainNav activeView={activeView} isOpen={navOpen} onToggle={() => setNavOpen(open => !open)} onNavigate={navigate} workspaces={session.workspaces || []} activeWorkspaceId={activeWorkspaceId} onChangeWorkspace={changeWorkspace} onSignOut={signOut} />
    <main className="app-main">
      <AppView
        key={`${activeView}:${activeWorkspaceId || ''}`}
        activeView={activeView}
        onNavigate={navigate}
        onChangeWorkspace={changeWorkspace}
        session={session}
        activeWorkspaceId={activeWorkspaceId}
        onSessionUpdated={refreshSession}
        userPreferences={userPreferences}
        onUpdateUserPreferences={updatePreferences}
        colorSchemes={colorSchemeState.schemes}
        selectedColorSchemeId={selectedScheme?.id || 'moss'}
        onSelectColorScheme={selectColorScheme}
        onImportColorScheme={importColorScheme}
        accessibility={accessibility}
        onAccessibilityChange={updateAccessibility}
      />
    </main>
  </div>;
}

export default App;

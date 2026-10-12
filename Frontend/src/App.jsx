import React, { useEffect, useState } from 'react';
import MainNav from './components/MainNav';
import AppView from './components/AppView';
import { readAccessibilitySettings, saveAccessibilitySettings } from './accessibilitySettings';
import { addCustomColorScheme, getInitialColorSchemeState, loadColorSchemes, saveColorSchemeSelection } from './colorSchemes';
import './App.css';

function App() {
  const [activeView, setActiveView] = useState('projects');
  const [navOpen, setNavOpen] = useState(false);
  const [colorSchemeState, setColorSchemeState] = useState(getInitialColorSchemeState);
  const [accessibility, setAccessibility] = useState(readAccessibilitySettings);

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
      return next;
    });
  };

  return <div className={`app-shell ${appClasses}`} data-text-size={accessibility.textSize} style={appStyle}>
    <MainNav activeView={activeView} isOpen={navOpen} onToggle={() => setNavOpen(open => !open)} onNavigate={navigate} />
    <main className="app-main">
      <AppView
        activeView={activeView}
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

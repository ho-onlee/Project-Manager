import React, { useEffect, useRef, useState } from 'react';
import { deleteGeminiSettingsAPI, fetchColorSchemeSchemaAPI, fetchColorSchemeTemplateAPI, fetchGeminiSettingsAPI, saveGeminiSettingsAPI, testGeminiSettingsAPI } from '../api';
import { DEFAULT_REPORT_PROMPT, REPORT_PROMPT_STORAGE_KEY, readReportPrompt } from '../reportPrompt';
import { readReviewReportData, saveReviewReportData } from '../accessibilitySettings';
import TeamAccessPanel from './TeamAccessPanel';

export default function SettingsView({ session, activeWorkspaceId, onChangeWorkspace, onSessionUpdated = async () => {}, userPreferences, onUpdateUserPreferences = () => {}, colorSchemes = [], selectedColorSchemeId = 'moss', onSelectColorScheme = () => {}, onImportColorScheme = () => {}, accessibility = { textSize: 'standard', highContrast: false, reduceMotion: false }, onAccessibilityChange = () => {} }) {
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [settings, setSettings] = useState(null);
  const [geminiWorkspaceId, setGeminiWorkspaceId] = useState(userPreferences?.geminiWorkspaceId || session?.geminiWorkspaceId || activeWorkspaceId || '');
  const autoTestStarted = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reportPrompt, setReportPrompt] = useState(readReportPrompt);
  const [promptMessage, setPromptMessage] = useState('');
  const [promptError, setPromptError] = useState('');
  const [schemeMessage, setSchemeMessage] = useState('');
  const [schemeError, setSchemeError] = useState('');
  const [reviewReportData, setReviewReportData] = useState(readReviewReportData);
  const keyVerified = Boolean(settings?.configured && settings?.validated);
  const availableGeminiWorkspaces = session?.workspaces || [];
  const keyWorkspace = availableGeminiWorkspaces.find(workspace => workspace.id === geminiWorkspaceId);
  const canManageGeminiKey = keyWorkspace?.type !== 'team' || ['owner', 'admin'].includes(keyWorkspace?.role);

  useEffect(() => {
    if (!userPreferences) return;
    setReportPrompt(userPreferences.reportPrompt || DEFAULT_REPORT_PROMPT);
    setReviewReportData(userPreferences.reviewReportData ?? true);
    const selectedKeyWorkspace = userPreferences.geminiWorkspaceId || session?.geminiWorkspaceId || activeWorkspaceId || '';
    setGeminiWorkspaceId(selectedKeyWorkspace);
    if (selectedKeyWorkspace) localStorage.setItem('projectnote-gemini-workspace', selectedKeyWorkspace);
  }, [userPreferences, activeWorkspaceId, session?.geminiWorkspaceId]);

  const importThemeFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSchemeMessage('');
    setSchemeError('');
    try {
      if (file.size > 100_000) throw new Error('Theme file must be smaller than 100 KB.');
      const imported = JSON.parse(await file.text());
      const scheme = onImportColorScheme(imported);
      setSchemeMessage(`${scheme.name} imported and applied.`);
    } catch (importError) {
      setSchemeError(importError instanceof SyntaxError ? 'That file is not valid JSON.' : importError.message || 'Theme does not match the ProjectNote schema.');
    } finally {
      event.target.value = '';
    }
  };

  const downloadThemeJson = async (fetchTheme, fileName) => {
    setSchemeMessage('');
    setSchemeError('');
    try {
      const response = await fetchTheme();
      const url = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setSchemeError('Theme schema could not be downloaded. Check the Django server.');
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetchGeminiSettingsAPI();
      setSettings(response.data);
      setError('');
      if (response.data.configured && !response.data.validated) await testKey();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Gemini settings could not be reached. Start Django on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoTestStarted.current) return;
    autoTestStarted.current = true;
    loadSettings();
  }, []);

  const saveKey = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await saveGeminiSettingsAPI(apiKey.trim());
      setSettings(response.data);
      setApiKey('');
      setShowKeyInput(false);
      if (response.data.configured && !response.data.validated) {
        await testKey();
      } else {
        setMessage('Saved API key is verified.');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.api_key?.[0] || requestError.response?.data?.detail || 'API key could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await deleteGeminiSettingsAPI();
      setSettings(response.data);
      setShowKeyInput(false);
      setMessage(response.data.configured ? 'Saved key removed. An environment variable is still active.' : 'Gemini API key removed.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'API key could not be removed.');
    } finally {
      setSaving(false);
    }
  };

  async function testKey() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await testGeminiSettingsAPI();
      setSettings(response.data);
      setShowKeyInput(false);
      setMessage('Gemini API key verified successfully.');
    } catch (requestError) {
      setSettings(current => current ? { ...current, validated: false } : current);
      setError(requestError.response?.data?.detail || 'Gemini key test failed.');
    } finally {
      setSaving(false);
    }
  }

  const changeGeminiWorkspace = async event => {
    const workspaceId = event.target.value;
    setGeminiWorkspaceId(workspaceId);
    if (workspaceId) localStorage.setItem('projectnote-gemini-workspace', workspaceId);
    onUpdateUserPreferences({ geminiWorkspaceId: workspaceId });
    setSettings(null);
    setLoading(true);
    setError('');
    try {
      const response = await fetchGeminiSettingsAPI();
      setSettings(response.data);
      if (response.data.configured && !response.data.validated) await testKey();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Gemini settings could not be loaded for this workspace.');
    } finally {
      setLoading(false);
    }
  };

  const saveReportPrompt = event => {
    event.preventDefault();
    try {
      localStorage.setItem(REPORT_PROMPT_STORAGE_KEY, reportPrompt.trim());
      onUpdateUserPreferences({ reportPrompt: reportPrompt.trim() });
      setPromptMessage('Report prompt saved in this browser.');
      setPromptError('');
    } catch {
      setPromptError('Prompt could not be saved in this browser.');
      setPromptMessage('');
    }
  };

  const resetReportPrompt = () => {
    setReportPrompt(DEFAULT_REPORT_PROMPT);
    try {
      localStorage.setItem(REPORT_PROMPT_STORAGE_KEY, DEFAULT_REPORT_PROMPT);
      onUpdateUserPreferences({ reportPrompt: DEFAULT_REPORT_PROMPT });
      setPromptMessage('Default report prompt restored.');
      setPromptError('');
    } catch {
      setPromptError('Prompt could not be saved in this browser.');
      setPromptMessage('');
    }
  };

  return (
    <section className="catalog-view settings-view">
      <div className="settings-card-masonry">
        <div className="settings-card-column">
      <section className="settings-panel color-scheme-panel" aria-labelledby="color-scheme-title">
        <div className="settings-panel-heading">
          <div><span className="eyebrow">Appearance</span><h2 id="color-scheme-title">Color scheme</h2></div>
        </div>
        <p className="settings-description">Choose the palette used across ProjectNote. Your choice is saved in this browser.</p>
        <div className="color-scheme-options" role="group" aria-label="Color scheme">
          {colorSchemes.map(scheme => (
            <button
              className={`color-scheme-option ${scheme.id === selectedColorSchemeId ? 'selected' : ''}`}
              key={scheme.id}
              type="button"
              aria-pressed={scheme.id === selectedColorSchemeId}
              onClick={() => onSelectColorScheme(scheme.id)}
            >
              <span className="color-scheme-swatches" aria-hidden="true">
                {scheme.swatches.map(color => <span key={color} style={{ backgroundColor: color }} />)}
              </span>
              <span className="color-scheme-copy"><strong>{scheme.name}</strong><small>{scheme.description}</small></span>
              <span className="color-scheme-check" aria-hidden="true">{scheme.id === selectedColorSchemeId ? '✓' : ''}</span>
            </button>
          ))}
          <label className="color-scheme-option color-scheme-upload">
            <input className="color-scheme-file" type="file" accept="application/json,.json" onChange={importThemeFile} />
            <span className="color-scheme-swatches upload-scheme-swatches" aria-hidden="true"><span>＋</span><span>#</span><span>JSON</span><span>…</span></span>
            <span className="color-scheme-copy"><strong>Upload my own theme</strong><small>Import a JSON color scheme using the provided schema.</small></span>
            <span className="color-scheme-check" aria-hidden="true">↑</span>
          </label>
        </div>
        <div className="color-scheme-tools">
          <button className="secondary-setting-button" type="button" onClick={() => downloadThemeJson(fetchColorSchemeSchemaAPI, 'projectnote-color-scheme.schema.json')}>Download JSON schema</button>
          <button className="secondary-setting-button" type="button" onClick={() => downloadThemeJson(fetchColorSchemeTemplateAPI, 'projectnote-color-scheme.template.json')}>Download starter theme</button>
        </div>
        {schemeMessage && <p className="settings-message" role="status">{schemeMessage}</p>}
        {schemeError && <p className="settings-error" role="alert">{schemeError}</p>}
      </section>
      <TeamAccessPanel session={session} activeWorkspaceId={activeWorkspaceId} onChangeWorkspace={onChangeWorkspace} onSessionUpdated={onSessionUpdated} />
      <section className="settings-panel report-prompt-panel" aria-labelledby="report-prompt-title">
        <div className="settings-panel-heading">
          <div><span className="eyebrow">Report instructions</span><h2 id="report-prompt-title">Prompt for report generation</h2></div>
        </div>
        <p className="settings-description">Set the focus and structure Gemini should use for each project report. Saved only in this browser.</p>
        <form className="report-prompt-form" onSubmit={saveReportPrompt}>
          <label htmlFor="report-generation-prompt">Report prompt</label>
          <textarea id="report-generation-prompt" rows="7" maxLength="4000" value={reportPrompt} onChange={event => setReportPrompt(event.target.value)} required />
          <div className="report-prompt-footer"><small>{reportPrompt.length}/4000</small><div>
            <button className="secondary-setting-button" type="button" onClick={resetReportPrompt}>Restore default</button>
            <button className="primary-button" type="submit" disabled={!reportPrompt.trim()}>Save prompt</button>
          </div></div>
        </form>
        {promptMessage && <p className="settings-message" role="status">{promptMessage}</p>}
        {promptError && <p className="settings-error" role="alert">{promptError}</p>}
      </section>
        </div>
        <div className="settings-card-column">
      <section className="settings-panel accessibility-panel" aria-labelledby="accessibility-title">
        <div className="settings-panel-heading">
          <div><span className="eyebrow">Display and motion</span><h2 id="accessibility-title">Accessibility</h2></div>
        </div>
        <label className="accessibility-size-control" htmlFor="accessibility-text-size">
          <span><strong>Text size</strong><small>Adjust reading text across the app.</small></span>
          <select id="accessibility-text-size" value={accessibility.textSize} onChange={event => onAccessibilityChange({ textSize: event.target.value })}>
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="largest">Largest</option>
          </select>
        </label>
        <label className="accessibility-toggle">
          <span><strong>Higher contrast</strong><small>Strengthen text and control boundaries.</small></span>
          <input type="checkbox" checked={accessibility.highContrast} onChange={event => onAccessibilityChange({ highContrast: event.target.checked })} />
        </label>
        <label className="accessibility-toggle">
          <span><strong>Reduce motion</strong><small>Minimize animations and transitions.</small></span>
          <input type="checkbox" checked={accessibility.reduceMotion} onChange={event => onAccessibilityChange({ reduceMotion: event.target.checked })} />
        </label>
      </section>
      <section className="settings-panel privacy-panel" aria-labelledby="privacy-title">
        <div className="settings-panel-heading">
          <div><span className="eyebrow">Gemini reports</span><h2 id="privacy-title">Privacy</h2></div>
        </div>
        <p className="settings-description">Review the exact project JSON and report prompt before sending anything to Google.</p>
        <label className="accessibility-toggle">
          <span><strong>Review report data before sending</strong><small>Show a confirmation with the full request payload.</small></span>
          <input type="checkbox" checked={reviewReportData} onChange={event => { setReviewReportData(event.target.checked); saveReviewReportData(event.target.checked); onUpdateUserPreferences({ reviewReportData: event.target.checked }); }} />
        </label>
      </section>
      <section className="settings-panel" aria-labelledby="gemini-settings-title">
        <div className="settings-panel-heading">
          <div><span className="eyebrow">Report generation</span><h2 id="gemini-settings-title">Google Gemini</h2></div>
          <span className={`settings-status ${keyVerified ? 'is-configured' : ''}`}>{loading ? 'Checking…' : keyVerified ? 'Verified' : settings?.configured ? 'Needs test' : 'Not configured'}</span>
        </div>
        {availableGeminiWorkspaces.length > 1 && <label className="gemini-workspace-choice">Use Gemini key from<select value={geminiWorkspaceId} onChange={changeGeminiWorkspace}>{availableGeminiWorkspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.type === 'team' ? 'Team' : 'Personal'}</option>)}</select></label>}
        <p className="settings-description">Reports use {settings?.model || 'gemini-3.5-flash-lite'}. Project JSON is sent to Google when generating a report. Your API key is saved in Windows Credential Manager and is never shown after saving.</p>
        {settings?.source && <p className="settings-source">Key source: {settings.source}</p>}
        {settings?.configured && <p className="settings-source">Testing sends one short prompt to verify Gemini access.</p>}
        {keyVerified && !showKeyInput && <div className="gemini-key-actions">
          <span className="settings-message">API key verified and ready.</span>
          <div>
            <button className="secondary-setting-button" type="button" onClick={testKey} disabled={saving}>{saving ? 'Testing…' : 'Test again'}</button>
            {canManageGeminiKey && <><button className="secondary-setting-button" type="button" onClick={() => setShowKeyInput(true)}>Change key</button><button className="settings-remove-button" type="button" onClick={removeKey} disabled={saving}>Remove key</button></>}
          </div>
        </div>}
        {settings?.configured && !keyVerified && <div className="gemini-key-actions">
          <button className="primary-button" type="button" onClick={testKey} disabled={saving || loading}>{saving ? 'Testing…' : 'Test saved key'}</button>
          {canManageGeminiKey && <button className="settings-remove-button" type="button" onClick={removeKey} disabled={saving}>Remove saved key</button>}
        </div>}
        {((!keyVerified && canManageGeminiKey) || showKeyInput) && <form className="settings-key-form" onSubmit={saveKey}>
          <label htmlFor="gemini-api-key">Gemini API key</label>
          <div className="settings-key-row">
            <input id="gemini-api-key" type="password" autoComplete="new-password" minLength="20" maxLength="512" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={settings?.configured ? 'Enter a new key to replace the saved key' : 'Paste your Gemini API key'} required />
            <button className="primary-button" type="submit" disabled={saving || loading || !apiKey.trim()}>{saving ? 'Saving…' : 'Save key'}</button>
            {keyVerified && showKeyInput && <button className="secondary-setting-button" type="button" onClick={() => { setShowKeyInput(false); setApiKey(''); }}>Cancel</button>}
          </div>
        </form>}
        {settings?.configured && !canManageGeminiKey && <p className="settings-source">This team key is managed by a team owner/admin. Team members can select it for reports but cannot replace or remove it.</p>}
        {!settings?.configured && !canManageGeminiKey && <p className="settings-source">This team has no Gemini key configured. Ask a team owner/admin to add one.</p>}
        {message && <p className="settings-message" role="status">{message}</p>}
        {error && <p className="settings-error" role="alert">{error}</p>}
      </section>
        </div>
      </div>
    </section>
  );
}
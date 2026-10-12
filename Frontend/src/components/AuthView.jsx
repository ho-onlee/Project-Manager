import React, { useEffect, useRef, useState } from 'react';
import { fetchAuthCsrfAPI, fetchTeamsForSignupAPI, googleLoginAPI, loginAPI, registerAPI, verifyEmailAPI } from '../api';

export default function AuthView({ onAuthenticated, initialError = '' }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const googleButtonRef = useRef(null);
  const accountIntentRef = useRef({ mode, teamId });
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => { accountIntentRef.current = { mode, teamId }; }, [mode, teamId]);

  useEffect(() => {
    fetchAuthCsrfAPI().catch(() => {});
    fetchTeamsForSignupAPI().then(response => setTeams(response.data)).catch(() => {});
    const verificationToken = new URLSearchParams(window.location.search).get('verify_email');
    if (!verificationToken) return;
    setLoading(true);
    verifyEmailAPI(verificationToken).then(response => {
      setMode('login');
      setEmail(response.data.email || '');
      setNotice('Email verified. Sign in to continue.');
      window.history.replaceState({}, '', window.location.pathname);
    }).catch(requestError => {
      setError(requestError.response?.data?.detail || 'Email verification failed.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined;
    const setupGoogle = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async response => {
          setLoading(true);
          setError('');
          try {
            const accountIntent = accountIntentRef.current;
            const result = await googleLoginAPI(response.credential, accountIntent.mode === 'register' ? accountIntent.teamId : '');
            onAuthenticated(result.data);
          } catch (requestError) {
            setError(requestError.response?.data?.detail || 'Google sign-in failed.');
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
    };
    const currentScript = document.querySelector('script[data-google-identity]');
    if (window.google?.accounts?.id) {
      setupGoogle();
      return undefined;
    }
    const script = currentScript || document.createElement('script');
    if (!currentScript) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.onload = setupGoogle;
      document.head.appendChild(script);
    }
    return undefined;
  }, [googleClientId, onAuthenticated]);

  const submit = async event => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchAuthCsrfAPI();
      const response = mode === 'login'
        ? await loginAPI({ email: email.trim(), password })
        : await registerAPI({ email: email.trim(), password, name, ...(teamId ? { teamId } : {}) });
      if (response.data.verificationRequired) {
        setNotice(`Check ${response.data.email} for a verification link before signing in.`);
        setMode('login');
        setPassword('');
      } else {
        onAuthenticated(response.data);
      }
    } catch (requestError) {
      const data = requestError.response?.data;
      const detail = data?.detail || data?.email?.[0] || data?.password?.[0] || data?.teamId?.[0];
      setError(detail || (requestError.response
        ? `The sign-in request was rejected (HTTP ${requestError.response.status}). Check the account details and try again.`
        : `Cannot reach the API at ${window.location.hostname}:8000. Ensure Django is running and retry.`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand"><span className="brand-mark">✦</span><span>ProjectNote</span></div>
        <div className="auth-heading">
          <p className="eyebrow">Your visual workspace</p>
          <h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p>{mode === 'login' ? 'Sign in to continue to your workspaces.' : 'A personal workspace is created for every account.'}</p>
        </div>
        <div className="auth-mode-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <label>Name<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>}
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} /></label>
          {mode === 'register' && <label>Team (optional)<select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Personal workspace only</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} (request access)</option>)}</select></label>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        {mode === 'register' && teamId && <p className="auth-pending-note">After email verification, your personal workspace is ready. A team admin must approve the access request.</p>}
        {googleClientId && <><div className="auth-divider"><span>or continue with</span></div><div className="google-signin-container" ref={googleButtonRef} /></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
      </section>
    </main>
  );
}

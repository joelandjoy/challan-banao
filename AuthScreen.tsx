import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ReceiptText, Store } from 'lucide-react';
import { localStore } from '../lib/localStore';
import { errorMessage } from '../lib/format';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [ownerName, setOwnerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    
    if (mode === 'signup') {
      if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      if (!ownerName.trim() || !shopName.trim()) { setError('Enter both the owner name and shop name.'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await localStore.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else if (mode === 'signup') {
        const { data, error: authError } = await localStore.auth.signUp({
          email: email.trim(), password,
          options: { data: { owner_name: ownerName.trim(), shop_name: shopName.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) setNotice('Account created. Check your email for the confirmation link, then come back to log in.');
      } else {
        setNotice('This browser-only version cannot send password-reset emails. Your shop records are stored in this browser, so keep your password safe.');
      }
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  const changeMode = (next: 'login' | 'signup' | 'reset') => { setMode(next); setError(''); setNotice(''); };

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand"><span className="brand-mark"><ReceiptText size={20} /></span><span>ledger</span></div>
        <div className="auth-visual-copy">
          <span className="eyebrow">BILLING, MADE SIMPLE</span>
          <h1>Your shop.<br />Your records.<br />All in one place.</h1>
          <p>Create bills and challans, manage products, and keep customer records without the clutter.</p>
        </div>
        <div className="auth-visual-foot"><span>Private to your shop</span><span>·</span><span>Made for everyday business</span></div>
      </section>
      <section className="auth-panel">
        <div className="mobile-brand"><span className="brand-mark"><ReceiptText size={20} /></span><span>ledger</span></div>
        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-icon"><Store size={21} /></span>
            <h2>{mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Set up your shop' : 'Reset your password'}</h2>
            <p>{mode === 'login' ? 'Sign in to continue to your workspace.' : mode === 'signup' ? 'Create your shop workspace on this device.' : 'Password-reset emails are not available without a backend.'}</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            {mode === 'signup' && <>
              <label>Owner’s name<input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="e.g. Geet Jain" autoComplete="name" required /></label>
              <label>Shop name<input value={shopName} onChange={e => setShopName(e.target.value)} placeholder="Your shop name" required /></label>
            </>}
            <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
            {mode !== 'reset' && <>
              <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} /><button type="button" className="icon-button reveal-button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
              {mode === 'signup' && <label>Confirm password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required minLength={8} /></label>}
              {mode === 'login' && <button type="button" className="text-button align-right" onClick={() => changeMode('reset')}>Forgot password?</button>}
            </>}
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-success" role="status">{notice}</div>}
            <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : null}{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Show reset information'}</button>
          </form>
          <div className="auth-switch">{mode === 'login' ? <>New to Ledger? <button className="text-button" onClick={() => changeMode('signup')}>Create an account</button></> : <> {mode === 'reset' ? 'Remember your password?' : 'Already have an account?'} <button className="text-button" onClick={() => changeMode('login')}>Sign in</button></>}</div>
          <p className="auth-legal">Browser-only mode: your shop data stays in this browser and is not synced to other devices. Clearing browser data may erase it. This local sign-in is not a secure cloud account.</p>
        </div>
      </section>
    </main>
  );
}

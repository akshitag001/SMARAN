import { useState, type FormEvent } from 'react';
import { login, problemText, setSession } from '../lib/api';

const SHOW_DEMO_HINT = import.meta.env.VITE_DEMO_HINT !== 'false';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      setSession(await login(phone.replace(/\D/g, ''), pin));
      onSignedIn();
    } catch (err) {
      setProblem(problemText(err).replace('this screen hasn’t been opened on this phone before', 'signing in needs signal the first time'));
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <p className="brand">
        Smaran <span lang="hi">स्मरण</span>
      </p>
      <div>
        <h1>Sign in</h1>
        <p className="lead">Use the mobile number registered with your Jan Shiksha Kendra and your PIN.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="phone">Mobile number</label>
          <input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={12} value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input id="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} required />
        </div>
        {problem && (
          <p className="error-line" role="alert">
            {problem}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {SHOW_DEMO_HINT && (
        <p className="hint">
          Sample data: sign in as Suresh Rathore with <b>98765 43210</b> and PIN <b>1234</b>.
        </p>
      )}
    </main>
  );
}

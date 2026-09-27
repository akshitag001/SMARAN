import { useState, type FormEvent } from 'react';
import { login, problemText, setSession } from '../lib/api';

const SHOW_DEMO_HINT = import.meta.env.VITE_DEMO_HINT !== 'false';
const DEMO = [
  { name: 'Suresh Rathore', role: 'CRP, visits schools', phone: '9876543210' },
  { name: 'Meera Joshi', role: 'Block Resource Coordinator', phone: '9876500022' },
  { name: 'Kavita Yadav', role: 'Teacher, GPS Ratanpur', phone: '9876500033' },
];

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
        <p className="lead">Use the mobile number your block office registered, and your PIN. CRPs, block coordinators and teachers all sign in here.</p>
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
        <div className="demo-logins">
          <p className="hint">Sample accounts, all with PIN <b>1234</b>. Tap one to fill it in.</p>
          {DEMO.map((d) => (
            <button key={d.phone} type="button" className="demo-login" onClick={() => (setPhone(d.phone), setPin('1234'))}>
              <b>{d.name}</b>
              <span>{d.role}</span>
              <span className="num">{d.phone.replace(/^(\d{5})(\d{5})$/, '$1 $2')}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

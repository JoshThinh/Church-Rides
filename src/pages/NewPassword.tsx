import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorNote, Field, Loading, PageTitle } from '../components/ui';
import { clearPasswordReset, setKeepSignedIn } from '../lib/storage';
import { errorMessage } from '../lib/useAsync';
import { useSession, useSessionReady } from '../session';

/** Where a driver lands after opening a password-reset email link. */
export function NewPassword() {
  const session = useSession();
  const ready = useSessionReady();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError("The two passwords don't match.");
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(password);
      clearPasswordReset();
      setKeepSignedIn(true);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="page"><Loading /></div>;

  return (
    <div className="page page--narrow">
      <PageTitle>Choose a new password</PageTitle>
      {!session ? (
        <div className="card form">
          <p>This reset link has expired or was opened in a different browser. Request a new one from the sign-in page.</p>
          <a className="btn btn--primary" href="#/drive">
            Go to driver sign-in
          </a>
        </div>
      ) : done ? (
        <div className="card form">
          <p className="note note--ok" role="status">
            Password changed. You're signed in.
          </p>
          <a className="btn btn--primary" href="#/drive">
            Go to my rides
          </a>
        </div>
      ) : (
        <form className="card form" method="post" action="#" onSubmit={submit} noValidate>
          <input type="email" name="username" autoComplete="username" value={session.email} readOnly hidden />
          <Field id="np-pass" label="New password" hint="At least 8 characters.">
            <input id="np-pass" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field id="np-confirm" label="Type it again">
            <input id="np-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <ErrorNote message={error} />}
          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </div>
  );
}

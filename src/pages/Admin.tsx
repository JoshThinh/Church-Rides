import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { DEMO_ADMIN } from '../api/demo';
import { DateBlock, Empty, ErrorNote, Field, Loading, PageTitle } from '../components/ui';
import { formatRange, fromLocalInput, hasEnded, toLocalInput } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import { eventSchema, fieldErrors } from '../lib/validation';
import { useSession, useSessionReady } from '../session';
import type { Category, PickupSpot, RideEvent } from '../types';
import { CATEGORY_LABELS } from '../types';

export function Admin() {
  const session = useSession();
  const ready = useSessionReady();
  if (!ready) return <div className="page"><Loading /></div>;
  if (session?.role !== 'admin') {
    return (
      <div className="page page--narrow">
        <PageTitle sub="Ride coordinators sign in here to add events.">Admin login</PageTitle>
        {session?.role === 'driver' && (
          <p className="note">You're signed in as a driver. Sign out from the menu first.</p>
        )}
        {!session && <AdminLogin />}
      </div>
    );
  }
  return <AdminHome />;
}

function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) return setError('Enter the username and password.');
    setBusy(true);
    setError(null);
    try {
      await api.signInAdmin(username, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Field id="a-user" label="Username">
        <input id="a-user" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field id="a-pass" label="Password">
        <input id="a-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <ErrorNote message={error} />}
      <button className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {api.mode === 'demo' && (
        <p className="muted small">
          Demo login: {DEMO_ADMIN.username} / {DEMO_ADMIN.password}
        </p>
      )}
    </form>
  );
}

function AdminHome() {
  const events = useAsync(() => api.listAllEvents(), []);
  const [editing, setEditing] = useState<RideEvent | null>(null);
  const [showPast, setShowPast] = useState(false);

  const list = (events.data ?? []).filter((e) => showPast || !hasEnded(e));

  return (
    <div className="page">
      <PageTitle sub="Add events riders can sign up for. The end time is also when group chat links disappear.">Admin</PageTitle>
      <div className="admin-layout">
        <section aria-labelledby="ev-heading">
          <div className="section-bar">
            <h2 id="ev-heading" className="section-heading">
              Events
            </h2>
            <label className="check check--small">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              <span>Show past</span>
            </label>
          </div>
          {events.loading && <Loading label="Loading events" />}
          {events.error && <ErrorNote message={events.error} />}
          {events.data && list.length === 0 && <Empty title="No events yet. Add the first one." />}
          <ul className="event-list">
            {list.map((e) => (
              <li key={e.id} className={`event-row event-row--static${hasEnded(e) ? ' is-past' : ''}`}>
                <DateBlock iso={e.startsAt} category={e.category} />
                <span className="event-row__body">
                  <span className="event-row__title">{e.title}</span>
                  <span className="event-row__meta">
                    {CATEGORY_LABELS[e.category]}, {formatRange(e.startsAt, e.endsAt)}
                  </span>
                </span>
                <button className="btn btn--ghost btn--small" onClick={() => setEditing(e)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="stack">
          <EventForm
            key={editing?.id ?? 'new'}
            initial={editing}
            onDone={() => {
              setEditing(null);
              events.reload();
            }}
          />
          <PickupSpots />
          <ChangePassword />
        </aside>
      </div>
    </div>
  );
}

function EventForm({ initial, onDone }: { initial: RideEvent | null; onDone: () => void }) {
  const [category, setCategory] = useState<Category>(initial?.category ?? 'event');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startsAt, setStartsAt] = useState(initial ? toLocalInput(initial.startsAt) : '');
  const [endsAt, setEndsAt] = useState(initial ? toLocalInput(initial.endsAt) : '');
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(null);
    const parsed = eventSchema.safeParse({ category, title, description, startsAt, endsAt, destination });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    setFormError(null);
    const input = { ...parsed.data, startsAt: fromLocalInput(parsed.data.startsAt), endsAt: fromLocalInput(parsed.data.endsAt) };
    try {
      if (initial) await api.updateEvent(initial.id, input);
      else await api.createEvent(input);
      setSaved(initial ? 'Event updated.' : `Added "${input.title}".`);
      if (!initial) {
        setTitle('');
        setDescription('');
        setStartsAt('');
        setEndsAt('');
      }
      onDone();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2 className="form__title">{initial ? 'Edit event' : 'Add an event'}</h2>
      <fieldset className="field">
        <legend>Type</legend>
        <div className="segmented">
          {(['church', 'cl', 'event'] as Category[]).map((c) => (
            <label key={c} className={`segmented__option cat-${c}${category === c ? ' is-checked' : ''}`}>
              <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} />
              {c === 'church' ? 'Church' : c === 'cl' ? 'CL' : 'Event'}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="e-title" label="What is it?" error={errors.title}>
        <input id="e-title" placeholder="e.g. Fall retreat" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id="e-desc" label="Details (optional)" error={errors.description}>
        <textarea id="e-desc" rows={2} placeholder="What to bring, where to meet, etc." value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="form__split">
        <Field id="e-start" label="Starts" error={errors.startsAt}>
          <input id="e-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field id="e-end" label="Ends" error={errors.endsAt}>
          <input id="e-end" type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <Field id="e-where" label="Where" error={errors.destination}>
        <input id="e-where" placeholder="Address or place name" value={destination} onChange={(e) => setDestination(e.target.value)} />
      </Field>
      {formError && <ErrorNote message={formError} />}
      {saved && (
        <p className="note note--ok" role="status">
          {saved}
        </p>
      )}
      <div className="form__row">
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add event'}
        </button>
        {initial && (
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      {initial &&
        (confirmDelete ? (
          <div className="ride-card__confirm">
            <span>Delete this event and all its sign-ups?</span>
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={async () => {
                try {
                  await api.deleteEvent(initial.id);
                  onDone();
                } catch (err) {
                  setFormError(errorMessage(err));
                }
              }}
            >
              Yes, delete
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className="link-button link-button--danger" onClick={() => setConfirmDelete(true)}>
            Delete event
          </button>
        ))}
    </form>
  );
}

function PickupSpots() {
  const spots = useAsync(() => api.listPickupSpots(), []);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      spots.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="card form">
      <h2 className="form__title">Pickup spots</h2>
      {spots.loading && <Loading />}
      <ul className="spot-list">
        {(spots.data ?? []).map((s) => (
          <SpotRow key={s.id} spot={s} onRename={(n) => run(() => api.renamePickupSpot(s.id, n))} onRemove={() => run(() => api.removePickupSpot(s.id))} />
        ))}
      </ul>
      <form
        className="inline-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 2) return setError('Enter a spot name.');
          void run(async () => {
            await api.addPickupSpot(name);
            setName('');
          });
        }}
      >
        <label htmlFor="new-spot" className="visually-hidden">
          New pickup spot
        </label>
        <input id="new-spot" placeholder="Add a pickup spot" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--ghost">Add</button>
      </form>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

function SpotRow({ spot, onRename, onRemove }: { spot: PickupSpot; onRename: (n: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(spot.name);
  if (editing) {
    return (
      <li className="spot spot--editing">
        <label htmlFor={`spot-${spot.id}`} className="visually-hidden">
          Rename {spot.name}
        </label>
        <input id={`spot-${spot.id}`} value={value} onChange={(e) => setValue(e.target.value)} />
        <button
          className="btn btn--ghost btn--small"
          onClick={() => {
            if (value.trim().length >= 2) onRename(value);
            setEditing(false);
          }}
        >
          Save
        </button>
      </li>
    );
  }
  return (
    <li className="spot">
      <span>{spot.name}</span>
      <span className="spot__actions">
        <button className="link-button" onClick={() => setEditing(true)}>
          Rename
        </button>
        <button className="link-button link-button--danger" onClick={onRemove}>
          Remove
        </button>
      </span>
    </li>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError("The two passwords don't match.");
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(password);
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2 className="form__title">Change admin password</h2>
      <p className="muted small">Everyone who uses the admin login will need the new password.</p>
      <Field id="pw-new" label="New password">
        <input id="pw-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field id="pw-confirm" label="Type it again">
        <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <ErrorNote message={error} />}
      {done && (
        <p className="note note--ok" role="status">
          Password changed.
        </p>
      )}
      <button className="btn btn--ghost" disabled={busy}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

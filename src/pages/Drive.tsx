import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { DateBlock, Empty, ErrorNote, Field, Loading, PageTitle } from '../components/ui';
import { groupByStop } from '../lib/assign';
import { formatClock, formatDay, formatRange, formatTime, fromLocalInput, toLocalInput } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import { driverProfileSchema, fieldErrors, formatPhone, isMessengerLink, offerSchema } from '../lib/validation';
import { clearPasswordReset, loadLastEmail, saveLastEmail, setKeepSignedIn } from '../lib/storage';
import { useSession, useSessionReady } from '../session';
import type { DriverOffer, DriverProfile, PickupSpot, RideEvent, RideSeries, WeeklyDrive } from '../types';
import { CATEGORY_LABELS, WEEKDAYS } from '../types';

export function Drive() {
  const session = useSession();
  const ready = useSessionReady();

  if (!ready) return <div className="page"><Loading /></div>;
  if (!session || session.role !== 'driver') {
    return (
      <div className="page page--narrow">
        <PageTitle sub="Sign in to register your car, offer seats, and see who you're picking up. You only need to sign in once on each device.">Drive</PageTitle>
        {session?.role === 'admin' && (
          <p className="note">You're signed in as admin. Sign out from the menu to sign in as a driver.</p>
        )}
        {!session && <DriverSignIn />}
      </div>
    );
  }
  return <DriverHome key={session.userId} />;
}

function DriverSignIn() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(() => (loadLastEmail() ? 'signin' : 'signup'));
  const [email, setEmail] = useState(loadLastEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const signup = mode === 'signup';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your email address.');
    if (password.length < 8) return setError(signup ? 'Use at least 8 characters for your password.' : 'Enter your password.');
    if (signup && password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      setKeepSignedIn(keep);
      saveLastEmail(email.trim().toLowerCase());
      if (signup) {
        const { needsConfirmation } = await api.signUpDriver(email, password);
        if (needsConfirmation) {
          setConfirmSentTo(email.trim());
          setMode('signin');
          setPassword('');
          setConfirm('');
        }
      } else {
        await api.signInDriver(email, password);
      }
      clearPasswordReset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'forgot') return <ForgotPassword initialEmail={email} onBack={() => setMode('signin')} />;

  if (confirmSentTo) {
    return (
      <div className="card form">
        <h2 className="form__title">Confirm your email</h2>
        <p>
          We sent a link to <strong>{confirmSentTo}</strong>. Tap it to finish making your driver account. It can take a minute, and it
          might land in spam.
        </p>
        <p className="note">After you tap the link, come back here and sign in with your email and password.</p>
        {resent && (
          <p className="note note--ok" role="status">
            Sent again.
          </p>
        )}
        {error && <ErrorNote message={error} />}
        <div className="form__row">
          <button type="button" className="btn btn--primary" onClick={() => setConfirmSentTo(null)}>
            I confirmed, sign in
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              setError(null);
              try {
                await api.resendConfirmation(confirmSentTo);
                setResent(true);
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Send the link again
          </button>
        </div>
      </div>
    );
  }

  return (
    // method="post" + autocomplete hints let the phone's password manager offer to save the password.
    <form className="card form" method="post" action="#" onSubmit={submit} noValidate>
      <div className="segmented segmented--two" role="tablist" aria-label="Sign in or create an account">
        <button type="button" role="tab" aria-selected={!signup} className={`segmented__option${!signup ? ' is-checked' : ''}`} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={signup} className={`segmented__option${signup ? ' is-checked' : ''}`} onClick={() => setMode('signup')}>
          New driver
        </button>
      </div>

      <Field id="driver-email" label="Email">
        <input
          id="driver-email"
          name="username"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field id="driver-password" label={signup ? 'Create a password' : 'Password'} hint={signup ? 'At least 8 characters.' : undefined}>
        <input
          id="driver-password"
          name="password"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {!signup && (
        <button type="button" className="link-button forgot-link" onClick={() => setMode('forgot')}>
          Forgot password?
        </button>
      )}
      {signup && (
        <Field id="driver-confirm" label="Type it again">
          <input id="driver-confirm" name="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      )}

      <label className="check">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>Keep me signed in on this device</span>
      </label>

      {error && <ErrorNote message={error} />}
      <button className="btn btn--primary btn--block" disabled={busy}>
        {busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create driver account' : 'Sign in'}
      </button>
      <p className="muted small">
        {signup
          ? 'Your phone may offer to save the password, so signing in later takes one tap.'
          : 'Signed in once on this phone? You stay signed in, so you rarely need your password.'}
      </p>
      {api.mode === 'demo' && <p className="muted small">Demo mode: accounts are saved only in this browser.</p>}
    </form>
  );
}

/** "Forgot password?": emails a link that brings the driver back here to set a new one. */
function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email you signed up with.');
    setError(null);
    setBusy(true);
    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card form">
        <h2 className="form__title">Check your email</h2>
        <p>
          If there's a driver account for <strong>{email.trim()}</strong>, we sent it a link to reset your password. It can take a minute,
          and it might land in spam.
        </p>
        <p className="note">Open the link on this same phone, in this browser. You'll come back here to choose a new password.</p>
        <div className="form__row">
          <button type="button" className="btn btn--ghost" onClick={() => setSent(false)}>
            Send it again
          </button>
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2 className="form__title">Reset your password</h2>
      <p className="muted">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
      <Field id="forgot-email" label="Email">
        <input id="forgot-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <ErrorNote message={error} />}
      <button className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a reset link'}
      </button>
      <button type="button" className="link-button" onClick={onBack}>
        Back to sign in
      </button>
      <p className="muted small">No email after a few minutes? A ride coordinator can also reset your password from the admin page.</p>
    </form>
  );
}

function DriverHome() {
  const profile = useAsync(() => api.getDriverProfile(), []);
  const offers = useAsync(() => api.listMyOffers(), []);
  const events = useAsync(() => api.listUpcomingEvents(), []);
  const spots = useAsync(() => api.listPickupSpots(), []);
  const [editingCar, setEditingCar] = useState(false);

  if (profile.loading) return <div className="page"><Loading /></div>;
  if (profile.error) return <div className="page"><ErrorNote message={profile.error} /></div>;

  if (!profile.data || editingCar) {
    return (
      <div className="page page--narrow">
        <PageTitle sub="Riders see your first name and car so they can find you.">
          {profile.data ? 'Edit my car' : 'Register your car'}
        </PageTitle>
        <CarForm
          initial={profile.data}
          onSaved={() => {
            setEditingCar(false);
            profile.reload();
          }}
          onCancel={profile.data ? () => setEditingCar(false) : undefined}
        />
      </div>
    );
  }

  const p = profile.data;
  const drivingFor = new Set((offers.data ?? []).map((o) => o.event.id));
  const openEvents = (events.data ?? []).filter((e) => !drivingFor.has(e.id) && new Date(e.startsAt) > new Date());

  return (
    <div className="page">
      <PageTitle
        sub={
          <>
            {p.carDescription}, {p.seats} seats.{' '}
            <button className="link-button" onClick={() => setEditingCar(true)}>
              Edit car
            </button>
          </>
        }
      >
        Your rides
      </PageTitle>

      {!p.approved && (
        <p className="note note--pending" role="status">
          <strong>Waiting for approval.</strong> A ride coordinator needs to approve you before riders can see your rides. You can set up
          your rides now, and they'll show up for riders once you're approved.
        </p>
      )}

      <div className="drive-layout">
        <section aria-label="Rides you're driving">
          {offers.loading && <Loading label="Loading your rides" />}
          {offers.error && <ErrorNote message={offers.error} />}
          {offers.data && offers.data.length === 0 && (
            <Empty title="You're not driving for anything yet.">
              <p>Choose "Drive every week" for Sunday services or College Life, or offer a single ride. Riders show up here as they sign up.</p>
            </Empty>
          )}
          <ul className="stack">
            {(offers.data ?? []).map((o) => (
              <li key={o.id}>
                <OfferCard offer={o} spots={spots.data ?? []} onChanged={offers.reload} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="stack">
          <WeeklyDrives profile={p} onChanged={offers.reload} />
          <OfferForm events={openEvents} profile={p} onCreated={offers.reload} />
        </aside>
      </div>
    </div>
  );
}

function CarForm({ initial, onSaved, onCancel }: { initial: DriverProfile | null; onSaved: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial ? formatPhone(initial.phone) : '');
  const [carDescription, setCar] = useState(initial?.carDescription ?? '');
  const [seats, setSeats] = useState(String(initial?.seats ?? 4));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = driverProfileSchema.safeParse({ name, phone, carDescription, seats });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await api.saveDriverProfile(parsed.data);
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Field id="d-name" label="Your name" hint="Shown to riders, e.g. Maria L." error={errors.name}>
        <input id="d-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="d-phone" label="Phone number" hint="Only your riders can see this." error={errors.phone}>
        <input id="d-phone" type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field id="d-car" label="Car" hint="Color, make, and model, e.g. Silver Honda CR-V" error={errors.carDescription}>
        <input id="d-car" value={carDescription} onChange={(e) => setCar(e.target.value)} />
      </Field>
      <Field id="d-seats" label="Seats for riders" hint="Not counting yours." error={errors.seats}>
        <input id="d-seats" type="number" inputMode="numeric" min={1} max={12} value={seats} onChange={(e) => setSeats(e.target.value)} />
      </Field>
      {formError && <ErrorNote message={formError} />}
      <div className="form__row">
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save car'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function OfferForm({ events, profile, onCreated }: { events: RideEvent[]; profile: DriverProfile; onCreated: () => void }) {
  const [eventId, setEventId] = useState('');
  const [seats, setSeats] = useState(String(profile.seats));
  const [departTime, setDepartTime] = useState('');
  const [gcJoinLink, setLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function chooseEvent(id: string) {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    // Suggest leaving 30 minutes before it starts.
    if (ev) setDepartTime(toLocalInput(new Date(new Date(ev.startsAt).getTime() - 30 * 60_000).toISOString()));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = offerSchema.safeParse({ eventId, seats, departTime, gcJoinLink });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      await api.createOffer({
        eventId: parsed.data.eventId,
        seats: parsed.data.seats,
        departTime: fromLocalInput(parsed.data.departTime),
        gcJoinLink: parsed.data.gcJoinLink || null,
      });
      setEventId('');
      setDepartTime('');
      setLink('');
      onCreated();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2 className="form__title">Offer a ride</h2>
      {events.length === 0 ? (
        <p className="muted">No upcoming rides need a driver right now.</p>
      ) : (
        <>
          <Field id="o-event" label="Ride" error={errors.eventId}>
            <select id="o-event" value={eventId} onChange={(e) => chooseEvent(e.target.value)}>
              <option value="">Choose a date</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {CATEGORY_LABELS[ev.category]}: {ev.title}, {formatDay(ev.startsAt)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form__split">
            <Field id="o-seats" label="Open seats" error={errors.seats}>
              <input id="o-seats" type="number" inputMode="numeric" min={1} max={12} value={seats} onChange={(e) => setSeats(e.target.value)} />
            </Field>
            <Field id="o-depart" label="Leaving SDSU at" error={errors.departTime}>
              <input id="o-depart" type="datetime-local" value={departTime} onChange={(e) => setDepartTime(e.target.value)} />
            </Field>
          </div>
          <Field
            id="o-link"
            label="Messenger group chat link (optional)"
            hint="In Messenger, open your group → Share link → copy. You can add it later. Riders stop seeing it after the event."
            error={errors.gcJoinLink}
          >
            <input
              id="o-link"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://m.me/j/..."
              value={gcJoinLink}
              onChange={(e) => setLink(e.target.value)}
              aria-describedby="o-link-hint"
            />
          </Field>
          {formError && <ErrorNote message={formError} />}
          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Posting…' : 'Offer this ride'}
          </button>
        </>
      )}
    </form>
  );
}

function OfferCard({ offer, spots, onChanged }: { offer: DriverOffer; spots: PickupSpot[]; onChanged: () => void }) {
  const [link, setLink] = useState(offer.gcJoinLink ?? '');
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const stops = groupByStop(offer.riders, spots.map((s) => s.id));
  const open = offer.seats - offer.riders.length;

  async function saveLink() {
    setLinkMsg(null);
    setLinkErr(null);
    const trimmed = link.trim();
    if (trimmed && !isMessengerLink(trimmed)) {
      setLinkErr('Paste a Messenger group link (starts with https://m.me/).');
      return;
    }
    try {
      await api.updateOfferLink(offer.id, trimmed || null);
      setLinkMsg(trimmed ? 'Link saved. Your riders can join now.' : 'Link removed.');
      onChanged();
    } catch (e) {
      setLinkErr(errorMessage(e));
    }
  }

  async function copyList() {
    const lines = [
      `${offer.event.title}, ${formatDay(offer.event.startsAt)}. Leaving ${formatTime(offer.departTime)}`,
      ...stops.flatMap((s) => [`\n${s.pickupName}`, ...s.riders.map((r) => `- ${r.riderName} ${formatPhone(r.phone)}${r.notes ? ` (${r.notes})` : ''}`)]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; nothing to do */
    }
  }

  return (
    <article className={`offer-card cat-${offer.event.category}`}>
      <header className="offer-card__head">
        <DateBlock iso={offer.event.startsAt} category={offer.event.category} />
        <div>
          <h3 className="ride-card__title">
            {offer.event.title}
            {offer.commitmentId && <span className="tag">Every week</span>}
          </h3>
          <p className="ride-card__meta">{formatRange(offer.event.startsAt, offer.event.endsAt)}</p>
          <p className="ride-card__meta">
            You leave at {formatTime(offer.departTime)}. {offer.riders.length} of {offer.seats} seats taken
            {open > 0 ? '.' : ', full.'}
          </p>
        </div>
      </header>

      {offer.riders.length === 0 ? (
        <p className="muted">No riders yet. They'll appear here as they sign up.</p>
      ) : (
        <ol className="stops">
          {stops.map((s) => (
            <li key={s.pickupId} className="stop">
              <p className="stop__name">{s.pickupName}</p>
              <ul className="stop__riders">
                {s.riders.map((r) => (
                  <li key={r.requestId} className="rider">
                    <span className="rider__name">{r.riderName}</span>
                    {r.messenger && <span className="rider__meta">Messenger: {r.messenger}</span>}
                    {r.notes && <span className="rider__meta">“{r.notes}”</span>}
                    <span className="rider__actions">
                      <a className="chip" href={`tel:+1${r.phone}`}>
                        Call
                      </a>
                      <a className="chip" href={`sms:+1${r.phone}`}>
                        Text
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <div className="offer-card__gc">
        <Field
          id={`gc-${offer.id}`}
          label="Messenger group chat link"
          hint="Riders in your car see a Join button until the event ends."
          error={linkErr ?? undefined}
        >
          <div className="inline-input">
            <input
              id={`gc-${offer.id}`}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://m.me/j/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button type="button" className="btn btn--ghost" onClick={saveLink}>
              Save
            </button>
          </div>
        </Field>
        {linkMsg && (
          <p className="note note--ok" role="status">
            {linkMsg}
          </p>
        )}
      </div>

      <div className="offer-card__foot">
        {offer.riders.length > 0 && (
          <button className="btn btn--ghost btn--small" onClick={copyList}>
            {copied ? 'Copied' : 'Copy rider list'}
          </button>
        )}
        {confirmRemove ? (
          <span className="ride-card__confirm">
            <span>
              {offer.commitmentId
                ? "Skip this week? You'll still drive the other weeks."
                : 'Stop driving? Your riders go back to waiting.'}
              {offer.riders.length > 0 && ' Riders in your car go back to waiting for a driver.'}
            </span>
            <button
              className="btn btn--danger btn--small"
              onClick={async () => {
                await api.deleteOffer(offer.id);
                onChanged();
              }}
            >
              {offer.commitmentId ? 'Yes, skip this week' : 'Yes, stop driving'}
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setConfirmRemove(false)}>
              Keep driving
            </button>
          </span>
        ) : (
          <button className="link-button" onClick={() => setConfirmRemove(true)}>
            {offer.commitmentId ? 'Skip this week' : 'Stop driving for this ride'}
          </button>
        )}
      </div>
    </article>
  );
}

const LEAVE_OPTIONS = [15, 20, 30, 45, 60];

/** "Drive every week": sign up once for Sunday services or College Life. */
function WeeklyDrives({ profile, onChanged }: { profile: DriverProfile; onChanged: () => void }) {
  const series = useAsync(() => api.listSeries(), []);
  const drives = useAsync(() => api.listMyWeeklyDrives(), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = (series.data ?? []).filter((s) => s.active);
  const driveFor = (s: RideSeries) => (drives.data ?? []).find((d) => d.seriesId === s.id && d.active);

  const refresh = () => {
    drives.reload();
    onChanged();
  };

  async function stop(d: WeeklyDrive, s: RideSeries) {
    setError(null);
    try {
      const kept = await api.stopWeeklyDrive(d.id);
      setMessage(
        kept > 0
          ? `Stopped driving every week for ${s.title}. You're still listed on ${kept} upcoming ${kept === 1 ? 'date' : 'dates'} where riders already signed up. Skip ${kept === 1 ? 'it' : 'them'} below if you can't make it.`
          : `Stopped driving every week for ${s.title}.`,
      );
      setStopping(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card form" aria-labelledby="weekly-drive-heading">
      <h2 id="weekly-drive-heading" className="form__title">
        Drive every week
      </h2>
      <p className="muted small">Sign up once and you're listed as a driver every week. You can skip a single week anytime.</p>
      {(series.loading || drives.loading) && <Loading />}
      {active.length === 0 && !series.loading && <p className="muted">No weekly rides are set up yet.</p>}
      <ul className="weekly-drives">
        {active.map((s) => {
          const d = driveFor(s);
          if (editing === s.id) {
            return (
              <li key={s.id}>
                <WeeklyDriveForm
                  series={s}
                  initial={d ?? null}
                  profile={profile}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setMessage(`You're driving every week for ${s.title}.`);
                    refresh();
                  }}
                />
              </li>
            );
          }
          return (
            <li key={s.id} className={`weekly-drive${d ? ' is-on' : ''}`}>
              <span className="weekly-drive__body">
                <span className="weekly-drive__title">{s.title}</span>
                <span className="weekly-drive__meta">
                  {s.category === 'church' ? 'Church' : 'College Life'}, {WEEKDAYS[s.weekday]}s at {formatClock(s.startTime)}
                </span>
                {d && (
                  <span className="weekly-drive__status">
                    Every week: {d.seats} {d.seats === 1 ? 'seat' : 'seats'}, leave {d.departOffsetMinutes} min before
                  </span>
                )}
              </span>
              {d ? (
                stopping === s.id ? (
                  <span className="ride-card__confirm">
                    <span>Stop driving every week?</span>
                    <button className="btn btn--danger btn--small" onClick={() => void stop(d, s)}>
                      Yes, stop
                    </button>
                    <button className="btn btn--ghost btn--small" onClick={() => setStopping(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="weekly-drive__actions">
                    <button className="btn btn--ghost btn--small" onClick={() => setEditing(s.id)}>
                      Edit
                    </button>
                    <button className="link-button link-button--danger" onClick={() => setStopping(s.id)}>
                      Stop
                    </button>
                  </span>
                )
              ) : (
                <button className="btn btn--primary btn--small" onClick={() => setEditing(s.id)} disabled={editing !== null}>
                  Drive every week
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {message && (
        <p className="note note--ok" role="status">
          {message}
        </p>
      )}
      {error && <ErrorNote message={error} />}
    </section>
  );
}

function WeeklyDriveForm(props: {
  series: RideSeries;
  initial: WeeklyDrive | null;
  profile: DriverProfile;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { series, initial, profile, onSaved, onCancel } = props;
  const [seats, setSeats] = useState(String(initial?.seats ?? profile.seats));
  const [offset, setOffset] = useState(initial?.departOffsetMinutes ?? 30);
  const [link, setLink] = useState(initial?.gcJoinLink ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fid = series.id;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(seats);
    if (!Number.isInteger(n) || n < 1 || n > 12) return setError('Seats must be between 1 and 12.');
    if (link.trim() && !isMessengerLink(link)) return setError('Paste a Messenger group link (starts with https://m.me/).');
    setError(null);
    setBusy(true);
    try {
      await api.saveWeeklyDrive({ seriesId: series.id, seats: n, departOffsetMinutes: offset, gcJoinLink: link.trim() || null });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="weekly-drive-form" onSubmit={submit} noValidate>
      <p className="weekly-drive__title">
        {series.title}, every {WEEKDAYS[series.weekday]} at {formatClock(series.startTime)}
      </p>
      <div className="form__split">
        <Field id={`wd-seats-${fid}`} label="Open seats">
          <input id={`wd-seats-${fid}`} type="number" inputMode="numeric" min={1} max={12} value={seats} onChange={(e) => setSeats(e.target.value)} />
        </Field>
        <Field id={`wd-leave-${fid}`} label="Leave SDSU">
          <select id={`wd-leave-${fid}`} value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
            {LEAVE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min before
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        id={`wd-link-${fid}`}
        label="Messenger group chat link (optional)"
        hint="Used every week. You can keep one group chat for your regular riders."
      >
        <input
          id={`wd-link-${fid}`}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          placeholder="https://m.me/j/..."
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </Field>
      {error && <ErrorNote message={error} />}
      <div className="form__row">
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Drive every week'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { DateBlock, Empty, ErrorNote, Field, Loading, PageTitle } from '../components/ui';
import { groupByStop } from '../lib/assign';
import { formatDay, formatRange, formatTime, fromLocalInput, toLocalInput } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';
import { driverProfileSchema, fieldErrors, formatPhone, isMessengerLink, offerSchema } from '../lib/validation';
import { useSession, useSessionReady } from '../session';
import type { DriverOffer, DriverProfile, PickupSpot, RideEvent } from '../types';
import { CATEGORY_LABELS } from '../types';

export function Drive() {
  const session = useSession();
  const ready = useSessionReady();

  if (!ready) return <div className="page"><Loading /></div>;
  if (!session || session.role !== 'driver') {
    return (
      <div className="page page--narrow">
        <PageTitle sub="Sign in to register your car, offer seats, and see who you're picking up.">Drive</PageTitle>
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
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { linkSent } = await api.signInDriver(email.trim());
      setSent(linkSent);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card">
        <h2 className="form__title">Check your email</h2>
        <p>We sent a sign-in link to {email}. Open it on this device to continue.</p>
      </div>
    );
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Field id="driver-email" label="Email" hint="We'll email you a sign-in link. No password needed." error={error ?? undefined}>
        <input
          id="driver-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="driver-email-hint"
        />
      </Field>
      <button className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Sending…' : api.mode === 'demo' ? 'Sign in (demo)' : 'Email me a sign-in link'}
      </button>
      {api.mode === 'demo' && <p className="muted small">Demo mode signs you in right away with any email.</p>}
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

      <div className="drive-layout">
        <section aria-label="Rides you're driving">
          {offers.loading && <Loading label="Loading your rides" />}
          {offers.error && <ErrorNote message={offers.error} />}
          {offers.data && offers.data.length === 0 && (
            <Empty title="You're not driving for anything yet.">
              <p>Offer a ride and riders will show up here as they sign up.</p>
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

        <aside>
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
          <h3 className="ride-card__title">{offer.event.title}</h3>
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
            <span>Stop driving? Your riders go back to waiting.</span>
            <button
              className="btn btn--danger btn--small"
              onClick={async () => {
                await api.deleteOffer(offer.id);
                onChanged();
              }}
            >
              Yes, stop driving
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setConfirmRemove(false)}>
              Keep driving
            </button>
          </span>
        ) : (
          <button className="link-button" onClick={() => setConfirmRemove(true)}>
            Stop driving for this ride
          </button>
        )}
      </div>
    </article>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { BackLink, DateBlock, Empty, ErrorNote, Field, Loading } from '../components/ui';
import { formatRange, formatTime } from '../lib/format';
import { addRideToken, forgetProfile, loadProfile, saveProfile } from '../lib/storage';
import { useAsync, errorMessage } from '../lib/useAsync';
import { fieldErrors, formatPhone, riderSchema } from '../lib/validation';
import type { MyRide, PickupSpot, PublicOffer, RideEvent } from '../types';
import { CATEGORY_LABELS } from '../types';
import { RideCard } from './MyRides';

export function RidePage({ eventId }: { eventId: string }) {
  const event = useAsync(() => api.getEvent(eventId), [eventId]);
  const offers = useAsync(() => api.listOffers(eventId), [eventId]);
  const spots = useAsync(() => api.listPickupSpots(), []);
  const [confirmed, setConfirmed] = useState<MyRide | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // On phones the form is below the driver list, so bring the confirmation into view.
  useEffect(() => {
    if (confirmed) confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [confirmed]);

  if (event.loading || spots.loading) return <div className="page"><Loading /></div>;
  if (event.error) return <div className="page"><ErrorNote message={event.error} /></div>;
  if (!event.data) {
    return (
      <div className="page">
        <BackLink to="/">All rides</BackLink>
        <Empty title="This ride doesn't exist anymore.">
          <p>It may have been removed. Go back and pick another date.</p>
        </Empty>
      </div>
    );
  }

  const e = event.data;
  const closed = new Date(e.startsAt) <= new Date();

  return (
    <div className={`page cat-${e.category}`}>
      <BackLink to={`/rides/${e.category}`}>{CATEGORY_LABELS[e.category]}</BackLink>

      <div className="ride-layout">
        <section className="ride-info">
          <EventHeader event={e} />
          <h2 className="section-heading">Drivers</h2>
          {offers.loading && <Loading label="Loading drivers" />}
          {offers.data && offers.data.length === 0 && (
            <p className="muted">No drivers yet. Sign up anyway, and you'll be matched when someone offers seats.</p>
          )}
          {offers.data && offers.data.length > 0 && (
            <ul className="driver-list">
              {offers.data.map((o) => (
                <li key={o.id} className="driver-row">
                  <span className="driver-row__name">{o.driverName}</span>
                  <span className="driver-row__car">
                    {o.carDescription}, leaves {formatTime(o.departTime)}
                  </span>
                  <SeatMeter seats={o.seats} taken={o.seatsTaken} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ride-form-wrap" aria-label="Sign up">
          {confirmed ? (
            <div className="confirm" ref={confirmRef} tabIndex={-1}>
              <h2 className="confirm__title">You're on the list.</h2>
              <RideCard ride={confirmed} />
              <a className="btn btn--ghost btn--block" href="#/my-rides">
                See all my rides
              </a>
            </div>
          ) : closed ? (
            <Empty title="Sign-ups are closed.">
              <p>This ride has already left. Pick another date.</p>
            </Empty>
          ) : (
            <SignUpForm
              event={e}
              offers={offers.data ?? []}
              spots={spots.data ?? []}
              onDone={(ride) => {
                setConfirmed(ride);
                offers.reload();
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function EventHeader({ event }: { event: RideEvent }) {
  return (
    <header className="event-header">
      <DateBlock iso={event.startsAt} category={event.category} />
      <div>
        <h1 className="event-header__title" tabIndex={-1}>{event.title}</h1>
        <p className="event-header__meta">{formatRange(event.startsAt, event.endsAt)}</p>
        {event.destination && <p className="event-header__meta">{event.destination}</p>}
        {event.description && <p className="event-header__desc">{event.description}</p>}
      </div>
    </header>
  );
}

function SeatMeter({ seats, taken }: { seats: number; taken: number }) {
  const left = Math.max(0, seats - taken);
  return (
    <span className="seats" aria-label={`${left} of ${seats} seats open`}>
      <span className="seats__dots" aria-hidden="true">
        {Array.from({ length: seats }, (_, i) => (
          <span key={i} className={i < taken ? 'seat seat--taken' : 'seat'} />
        ))}
      </span>
      <span className="seats__text">{left === 0 ? 'Full' : `${left} open`}</span>
    </span>
  );
}

function SignUpForm(props: {
  event: RideEvent;
  offers: PublicOffer[];
  spots: PickupSpot[];
  onDone: (ride: MyRide) => void;
}) {
  const { event, offers, spots, onDone } = props;
  const saved = loadProfile();
  const savedSpotOk = saved && spots.some((s) => s.id === saved.pickupId);

  const [editing, setEditing] = useState(!saved);
  const [riderName, setRiderName] = useState(saved?.riderName ?? '');
  const [phone, setPhone] = useState(saved ? formatPhone(saved.phone) : '');
  const [messenger, setMessenger] = useState(saved?.messenger ?? '');
  const [pickupId, setPickupId] = useState(saved && savedSpotOk ? saved.pickupId : '');
  const [offerId, setOfferId] = useState<string>('any');
  const [notes, setNotes] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const parsed = riderSchema.safeParse({ riderName, phone, messenger, pickupId, notes });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      // Saved details are hidden in the summary view, so open the editor if they're the problem.
      if (errs.riderName || errs.phone || errs.messenger) setEditing(true);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const data = parsed.data;
      const result = await api.requestRide({
        eventId: event.id,
        ...data,
        offerId: offerId === 'any' ? null : offerId,
      });
      addRideToken(result.token);
      if (remember) {
        saveProfile({ riderName: data.riderName, phone: data.phone, messenger: data.messenger, pickupId: data.pickupId });
      } else {
        forgetProfile();
      }
      const [ride] = await api.getMyRides([result.token]);
      onDone(ride);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const describedBy = (id: string, hint = false) =>
    [hint ? `${id}-hint` : '', errors[id] ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2 className="form__title">Sign up for this ride</h2>

      {!editing && saved ? (
        <div className="saved">
          <p className="saved__label">Signing up as</p>
          <p className="saved__name">{riderName}</p>
          <p className="saved__meta">
            {phone}
            {messenger && `, Messenger: ${messenger}`}
          </p>
          <div className="saved__actions">
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit my details
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                forgetProfile();
                setRiderName('');
                setPhone('');
                setMessenger('');
                setPickupId('');
                setEditing(true);
              }}
            >
              Not {riderName.split(' ')[0]}?
            </button>
          </div>
        </div>
      ) : (
        <>
          <Field id="riderName" label="Your name" error={errors.riderName}>
            <input
              id="riderName"
              autoComplete="name"
              value={riderName}
              onChange={(e) => setRiderName(e.target.value)}
              aria-invalid={!!errors.riderName}
              aria-describedby={describedBy('riderName')}
            />
          </Field>
          <Field id="phone" label="Phone number" hint="Your driver uses this to reach you." error={errors.phone}>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(619) 555-0142"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy('phone', true)}
            />
          </Field>
          <Field
            id="messenger"
            label="Messenger name (optional)"
            hint="Helps your driver add you to the ride's group chat."
            error={errors.messenger}
          >
            <input
              id="messenger"
              autoCapitalize="none"
              placeholder="e.g. jo.thinh"
              value={messenger}
              onChange={(e) => setMessenger(e.target.value)}
              aria-describedby={describedBy('messenger', true)}
            />
          </Field>
        </>
      )}

      <Field id="pickupId" label="Pickup spot" error={errors.pickupId}>
        <select
          id="pickupId"
          value={pickupId}
          onChange={(e) => setPickupId(e.target.value)}
          aria-invalid={!!errors.pickupId}
          aria-describedby={describedBy('pickupId')}
        >
          <option value="">Choose where to get picked up</option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="field choice-group">
        <legend>Driver</legend>
        <label className={`choice${offerId === 'any' ? ' is-checked' : ''}`}>
          <input type="radio" name="offer" value="any" checked={offerId === 'any'} onChange={() => setOfferId('any')} />
          <span className="choice__text">
            <span className="choice__title">Any driver</span>
            <span className="choice__sub">We'll put you in a car that's already stopping near you.</span>
          </span>
        </label>
        {offers.map((o) => {
          const full = o.seatsTaken >= o.seats;
          return (
            <label key={o.id} className={`choice${offerId === o.id ? ' is-checked' : ''}${full ? ' is-disabled' : ''}`}>
              <input
                type="radio"
                name="offer"
                value={o.id}
                disabled={full}
                checked={offerId === o.id}
                onChange={() => setOfferId(o.id)}
              />
              <span className="choice__text">
                <span className="choice__title">{o.driverName}</span>
                <span className="choice__sub">
                  {full ? 'Full' : `${o.seats - o.seatsTaken} open, leaves ${formatTime(o.departTime)}`}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <Field id="notes" label="Note for your driver (optional)" error={errors.notes}>
        <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I'll be by the bike racks" />
      </Field>

      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember me on this device</span>
      </label>

      {formError && <ErrorNote message={formError} />}

      <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
        {busy ? 'Signing you up…' : 'Sign me up'}
      </button>
    </form>
  );
}

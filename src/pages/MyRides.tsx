import { useState } from 'react';
import { api } from '../api';
import { DateBlock, Empty, ErrorNote, Loading, PageTitle } from '../components/ui';
import { formatRange, formatTime, hasEnded } from '../lib/format';
import { loadRideTokens, removeRideToken } from '../lib/storage';
import { errorMessage, useAsync } from '../lib/useAsync';
import { formatPhone } from '../lib/validation';
import type { MyRide } from '../types';

export function MyRides() {
  const rides = useAsync(() => api.getMyRides(loadRideTokens()), []);
  const upcoming = rides.data?.filter((r) => !hasEnded(r.event)) ?? [];

  return (
    <div className="page">
      <PageTitle sub="Rides you signed up for on this device.">My rides</PageTitle>
      {rides.loading && <Loading label="Loading your rides" />}
      {rides.error && <ErrorNote message={rides.error} />}
      {rides.data && upcoming.length === 0 && (
        <Empty title="No upcoming rides.">
          <a className="btn btn--primary" href="#/">
            Find a ride
          </a>
        </Empty>
      )}
      <ul className="stack">
        {upcoming.map((r) => (
          <li key={r.token}>
            <RideCard ride={r} onCancelled={rides.reload} showCancel />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One signed-up ride: who's driving, where to wait, and the group chat button. */
export function RideCard({ ride, showCancel, onCancelled }: { ride: MyRide; showCancel?: boolean; onCancelled?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelRide(ride.token);
      removeRideToken(ride.token);
      onCancelled?.();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const { event, driver } = ride;
  return (
    <article className={`ride-card cat-${event.category}`}>
      <div className="ride-card__top">
        <DateBlock iso={event.startsAt} category={event.category} />
        <div>
          <h3 className="ride-card__title">{event.title}</h3>
          <p className="ride-card__meta">{formatRange(event.startsAt, event.endsAt)}</p>
        </div>
      </div>

      <dl className="ride-card__facts">
        <div>
          <dt>Pickup</dt>
          <dd>{ride.pickupName}</dd>
        </div>
        <div>
          <dt>Driver</dt>
          <dd>
            {driver ? (
              <>
                {driver.name}, {driver.carDescription}
                <br />
                Leaves at {formatTime(driver.departTime)}
              </>
            ) : (
              "Not matched yet. You'll get a driver as soon as someone offers seats."
            )}
          </dd>
        </div>
      </dl>

      <div className="ride-card__actions">
        {ride.gcJoinLink && (
          <a className="btn btn--messenger" href={ride.gcJoinLink} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M8 8.5h8M8 11.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Join group chat
          </a>
        )}
        {driver && (
          <a className="btn btn--ghost" href={`sms:+1${driver.phone}`}>
            Text {driver.name.split(' ')[0]} at {formatPhone(driver.phone)}
          </a>
        )}
      </div>
      {driver && !ride.gcJoinLink && <p className="muted small">Your driver hasn't added a group chat yet.</p>}

      {showCancel &&
        (confirming ? (
          <div className="ride-card__confirm">
            <span>Cancel this ride?</span>
            <button className="btn btn--danger btn--small" onClick={cancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Yes, cancel'}
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
          </div>
        ) : (
          <button className="link-button ride-card__cancel" onClick={() => setConfirming(true)}>
            Cancel my ride
          </button>
        ))}
      {error && <ErrorNote message={error} />}
    </article>
  );
}

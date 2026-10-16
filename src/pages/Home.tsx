import { api } from '../api';
import { formatDay, formatTime } from '../lib/format';
import { loadProfile, loadRideTokens } from '../lib/storage';
import { useAsync } from '../lib/useAsync';
import type { Category, RideEvent } from '../types';
import { CATEGORY_LABELS } from '../types';

const BLURBS: Record<Category, string> = {
  church: 'Sunday service',
  cl: 'Weekly CL night',
  event: 'Retreats, outings, and one-offs',
};

const CATEGORIES: Category[] = ['church', 'cl', 'event'];

export function Home() {
  const profile = loadProfile();
  const events = useAsync(() => api.listUpcomingEvents(), []);
  const spots = useAsync(() => api.listPickupSpots(), []);
  const mine = useAsync(() => api.getMyRides(loadRideTokens()), []);

  const nextOf = (c: Category): RideEvent | undefined => events.data?.find((e) => e.category === c);
  const countOf = (c: Category) => events.data?.filter((e) => e.category === c).length ?? 0;
  const nextMine = mine.data?.find((r) => new Date(r.event.endsAt) > new Date());

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__text">
          <p className="hero__greeting">{profile ? `Hey ${profile.riderName.split(' ')[0]},` : 'Hey SDSU,'}</p>
          <h1 className="hero__title" tabIndex={-1}>Need a ride this week?</h1>
          <p className="hero__lede">Pick where you're headed, choose your pickup spot, and you'll know your driver before you leave.</p>
        </div>
        <RouteMap stops={(spots.data ?? []).slice(0, 7).map((s) => s.name)} />
      </section>

      {nextMine && (
        <a className="next-ride" href="#/my-rides">
          <span className="next-ride__label">Your next ride</span>
          <span className="next-ride__what">
            {nextMine.event.title}, {formatDay(nextMine.event.startsAt)}
          </span>
          <span className="next-ride__who">
            {nextMine.driver
              ? `${nextMine.driver.name} picks you up at ${nextMine.pickupName}, ${formatTime(nextMine.driver.departTime)}`
              : `Waiting for a driver, pickup at ${nextMine.pickupName}`}
          </span>
        </a>
      )}

      <section aria-labelledby="where-heading">
        <h2 id="where-heading" className="section-heading">
          Where are you going?
        </h2>
        <ul className="destinations">
          {CATEGORIES.map((c) => {
            const next = nextOf(c);
            const count = countOf(c);
            return (
              <li key={c}>
                <a className={`destination cat-${c}`} href={`#/rides/${c}`}>
                  <span className="destination__name">{CATEGORY_LABELS[c]}</span>
                  <span className="destination__blurb">{BLURBS[c]}</span>
                  <span className="destination__next">
                    {events.loading
                      ? 'Checking dates…'
                      : next
                        ? `Next: ${formatDay(next.startsAt)}, ${formatTime(next.startsAt)}${count > 1 ? ` (+${count - 1} more)` : ''}`
                        : 'No dates posted yet'}
                  </span>
                  <svg className="destination__arrow" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <a className="drive-prompt" href="#/drive">
        <strong>Have a car?</strong> Register it and offer a few seats.
      </a>
    </div>
  );
}

/** The signature graphic: SDSU pickup stops along a route line ending at church. */
function RouteMap({ stops }: { stops: string[] }) {
  const shown = stops.filter((s) => !s.toLowerCase().startsWith('other')).slice(0, 5);
  return (
    <figure className="route-map" aria-label="Pickup spots around SDSU">
      <ol className="route-map__stops">
        {shown.map((s) => (
          <li key={s} className="route-map__stop">
            {s}
          </li>
        ))}
        <li className="route-map__stop route-map__stop--end">Church</li>
      </ol>
    </figure>
  );
}

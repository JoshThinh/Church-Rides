import type { ReactElement } from 'react';
import { api } from '../api';
import { daysFromToday, formatClock, formatDay, formatTime, formatToday, joinTimes, relativeDay } from '../lib/format';
import { loadProfile, loadRideTokens } from '../lib/storage';
import { useAsync } from '../lib/useAsync';
import { useNow } from '../lib/useNow';
import type { Category, RideEvent, RideSeries } from '../types';
import { CATEGORY_LABELS, WEEKDAYS } from '../types';

const BLURBS: Record<Category, string> = {
  church: 'Sunday services',
  cl: 'Weekly with the college group',
  event: 'Retreats, outings, and one-offs',
};

const CATEGORIES: Category[] = ['church', 'cl', 'event'];

/** Simple line icons so the three choices are told apart by shape, not color. */
const iconProps = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ICONS: Record<Category, ReactElement> = {
  church: (
    <svg {...iconProps}>
      <path d="M12 2v4M10 4h4" />
      <path d="M5 21V11l7-5 7 5v10" />
      <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
      <path d="M3 21h18" />
    </svg>
  ),
  cl: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3.5 19.5c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" />
      <path d="M15 14.2c.6-.2 1.3-.3 2-.3 2.4 0 4 1.8 4 4.6" />
    </svg>
  ),
  event: (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m12 12.6.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
    </svg>
  ),
};

/** "Sundays 8:30 & 10:45 AM" for each weekly category, built from the admin's schedule. */
function scheduleLines(series: RideSeries[]): { category: Category; text: string }[] {
  const out: { category: Category; text: string }[] = [];
  for (const category of ['church', 'cl'] as const) {
    const items = series.filter((s) => s.active && s.category === category);
    const days = [...new Set(items.map((s) => s.weekday))];
    for (const day of days) {
      const times = items.filter((s) => s.weekday === day).map((s) => formatClock(s.startTime));
      const label = category === 'church' ? 'Church' : 'College Life';
      out.push({ category, text: `${label}, ${WEEKDAYS[day]}s ${joinClock(times)}` });
    }
  }
  return out;
}

/** ["8:30 AM", "10:45 AM"] → "8:30 & 10:45 AM" */
function joinClock(times: string[]): string {
  if (times.length <= 1) return times[0] ?? '';
  const suffix = times[0].slice(-2);
  const same = times.every((t) => t.slice(-2) === suffix);
  const parts = same ? times.map((t, i) => (i < times.length - 1 ? t.slice(0, -3) : t)) : times;
  return parts.slice(0, -1).join(', ') + ' & ' + parts[parts.length - 1];
}

/** The next day this category has a ride, with every start time on that day. */
function nextDay(events: RideEvent[], c: Category, now: Date) {
  const mine = events.filter((e) => e.category === c && new Date(e.startsAt) > now);
  if (mine.length === 0) return null;
  const first = mine[0];
  const sameDay = mine.filter((e) => daysFromToday(e.startsAt, now) === daysFromToday(first.startsAt, now));
  const rel = relativeDay(first.startsAt, now);
  const date = formatDay(first.startsAt);
  return {
    when: rel === date ? date : `${rel}, ${date.replace(/^\w+, /, '')}`,
    times: joinTimes(sameDay.map((e) => e.startsAt)),
    soon: daysFromToday(first.startsAt, now) <= 1,
    more: new Set(mine.map((e) => daysFromToday(e.startsAt, now))).size - 1,
  };
}

export function Home() {
  const now = useNow();
  const profile = loadProfile();
  const events = useAsync(() => api.listUpcomingEvents(), []);
  const series = useAsync(() => api.listSeries(), []);
  const spots = useAsync(() => api.listPickupSpots(), []);
  const mine = useAsync(() => api.getMyRides(loadRideTokens()), []);

  const nextMine = mine.data?.find((r) => new Date(r.event.endsAt) > now);
  const lines = scheduleLines(series.data ?? []);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__inner">
          <div className="hero__text">
            <p className="hero__today">
              <time dateTime={now.toISOString()}>Today is {formatToday(now)}</time>
            </p>
            <h1 className="hero__title" tabIndex={-1}>
              {profile ? `Need a ride this week, ${profile.riderName.split(' ')[0]}?` : 'Need a ride this week?'}
            </h1>
            <p className="hero__lede">Pick where you're headed, choose your pickup spot, and you'll know your driver before you leave.</p>
            {lines.length > 0 && (
              <ul className="hero__schedule" aria-label="Weekly schedule">
                {lines.map((l) => (
                  <li key={l.text}>{l.text}</li>
                ))}
              </ul>
            )}
          </div>
          <RouteMap stops={(spots.data ?? []).slice(0, 7).map((s) => s.name)} />
        </div>
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
            const next = events.data ? nextDay(events.data, c, now) : null;
            return (
              <li key={c}>
                <a className={`destination cat-${c}`} href={`#/rides/${c}`}>
                  <span className="destination__icon">{ICONS[c]}</span>
                  <span className="destination__name">{CATEGORY_LABELS[c]}</span>
                  <span className="destination__blurb">{BLURBS[c]}</span>
                  {events.loading ? (
                    <span className="destination__next">Checking dates…</span>
                  ) : next ? (
                    <span className="destination__next">
                      <span className={`destination__when${next.soon ? ' is-soon' : ''}`}>{next.when}</span>
                      <span className="destination__times">{next.times}</span>
                      {next.more > 0 && (
                        <span className="destination__more">
                          {next.more} more {c === 'church' ? (next.more === 1 ? 'Sunday' : 'Sundays') : next.more === 1 ? 'date' : 'dates'} posted
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="destination__next">No dates posted yet</span>
                  )}
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
        <li className="route-map__stop route-map__stop--end">Lighthouse Bible Church</li>
      </ol>
    </figure>
  );
}

import { api } from '../api';
import { BackLink, DateBlock, Empty, ErrorNote, Loading, PageTitle } from '../components/ui';
import { daysFromToday, formatDay, formatRange, formatTime, relativeDay } from '../lib/format';
import { useNow } from '../lib/useNow';
import { useAsync } from '../lib/useAsync';
import type { Category, RideEvent } from '../types';
import { CATEGORY_LABELS, signupsClosed } from '../types';

const SUBTITLES: Record<Category, string> = {
  church: 'Pick a Sunday to see who is driving.',
  cl: 'Pick a College Life night to see who is driving.',
  event: 'Pick an event to see who is driving.',
};

export function RideList({ category }: { category: Category }) {
  const events = useAsync(() => api.listUpcomingEvents(category), [category]);
  const now = useNow();

  return (
    <div className={`page cat-${category}`}>
      <BackLink to="/">All rides</BackLink>
      <PageTitle sub={SUBTITLES[category]}>{CATEGORY_LABELS[category]}</PageTitle>

      {events.loading && <Loading label="Loading dates" />}
      {events.error && <ErrorNote message={events.error} />}
      {events.data && events.data.length === 0 && (
        <Empty title="No dates posted yet.">
          <p>Check back later. Ride coordinators add dates through the admin page.</p>
        </Empty>
      )}

      {events.data &&
        groupByDay(events.data, now).map((group) => (
          <section key={group.key} className="day-group" aria-label={group.label}>
            <h2 className={`day-group__label${group.soon ? ' is-soon' : ''}`}>{group.label}</h2>
            <ul className="event-list">
              {group.events.map((e) => (
                <li key={e.id}>
                  <a className="event-row" href={`#/ride/${e.id}`}>
                    <DateBlock iso={e.startsAt} category={e.category} />
                    <span className="event-row__body">
                      <span className="event-row__title">{e.title}</span>
                      <span className="event-row__meta">
                        {sameDay(e) ? `${formatTime(e.startsAt)} – ${formatTime(e.endsAt)}` : formatRange(e.startsAt, e.endsAt)}
                      </span>
                      {e.destination && <span className="event-row__meta">{e.destination}</span>}
                    </span>
                    <span className={`event-row__cta${signupsClosed(e, now) ? ' is-closed' : ''}`}>
                      {signupsClosed(e, now) ? 'Closed' : 'Sign up'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

/** Groups rides by calendar day: "Today", "Tomorrow", "This Sunday, Oct 18", "Sun, Oct 25". */
function groupByDay(events: RideEvent[], now: Date) {
  const groups: { key: string; label: string; soon: boolean; events: RideEvent[] }[] = [];
  for (const e of events) {
    const key = String(daysFromToday(e.startsAt, now));
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const rel = relativeDay(e.startsAt, now);
      const date = formatDay(e.startsAt);
      g = { key, label: rel === date ? date : `${rel}, ${date.replace(/^\w+, /, '')}`, soon: Number(key) <= 1, events: [] };
      groups.push(g);
    }
    g.events.push(e);
  }
  return groups;
}

const sameDay = (e: RideEvent) => new Date(e.startsAt).toDateString() === new Date(e.endsAt).toDateString();

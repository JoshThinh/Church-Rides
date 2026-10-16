import { api } from '../api';
import { BackLink, DateBlock, Empty, ErrorNote, Loading, PageTitle } from '../components/ui';
import { formatRange } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { Category } from '../types';
import { CATEGORY_LABELS } from '../types';

const SUBTITLES: Record<Category, string> = {
  church: 'Pick a Sunday to see who is driving.',
  cl: 'Pick a CL night to see who is driving.',
  event: 'Pick an event to see who is driving.',
};

export function RideList({ category }: { category: Category }) {
  const events = useAsync(() => api.listUpcomingEvents(category), [category]);

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

      {events.data && events.data.length > 0 && (
        <ul className="event-list">
          {events.data.map((e) => (
            <li key={e.id}>
              <a className="event-row" href={`#/ride/${e.id}`}>
                <DateBlock iso={e.startsAt} category={e.category} />
                <span className="event-row__body">
                  <span className="event-row__title">{e.title}</span>
                  <span className="event-row__meta">{formatRange(e.startsAt, e.endsAt)}</span>
                  {e.destination && <span className="event-row__meta">{e.destination}</span>}
                </span>
                <span className="event-row__cta">Sign up</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

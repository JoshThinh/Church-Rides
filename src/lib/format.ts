// Date helpers. All times display in the viewer's local time zone.

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatRange(startIso: string, endIso: string): string {
  const sameDay = new Date(startIso).toDateString() === new Date(endIso).toDateString();
  return sameDay
    ? `${formatDay(startIso)}, ${formatTime(startIso)} – ${formatTime(endIso)}`
    : `${formatDay(startIso)} ${formatTime(startIso)} – ${formatDay(endIso)} ${formatTime(endIso)}`;
}

/** Big date block parts: { month: "Oct", day: "18", weekday: "Sun" } */
export function dateParts(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

/** ISO string → value for <input type="datetime-local"> (local time, no seconds). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO string. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export function hasEnded(event: { endsAt: string }, now = new Date()): boolean {
  return new Date(event.endsAt) <= now;
}

/** "Friday, October 16" */
export function formatToday(now = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Whole days from today to the day of `iso` (0 = today, 1 = tomorrow). */
export function daysFromToday(iso: string, now = new Date()): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = new Date(iso);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "This Sunday", or "Sun, Oct 25" for later dates. */
export function relativeDay(iso: string, now = new Date()): string {
  const days = daysFromToday(iso, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return `This ${new Date(iso).toLocaleDateString(undefined, { weekday: 'long' })}`;
  return formatDay(iso);
}

/** Several start times on one day, e.g. "8:30 & 10:45 AM". */
export function joinTimes(isos: string[]): string {
  const times = isos.map(formatTime);
  if (times.length <= 1) return times[0] ?? '';
  const suffix = (t: string) => t.slice(-2);
  const sameHalf = times.every((t) => suffix(t) === suffix(times[0]));
  const parts = sameHalf ? times.map((t, i) => (i < times.length - 1 ? t.slice(0, -3) : t)) : times;
  return parts.slice(0, -1).join(', ') + ' & ' + parts[parts.length - 1];
}

/** "08:30" → "8:30 AM" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return formatTime(d.toISOString());
}

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

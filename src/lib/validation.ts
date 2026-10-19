import { z } from 'zod';

/** Keeps only digits; drops a leading US "1" country code. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

export function formatPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Messenger group chat join links look like https://m.me/j/AbC123 */
const GC_LINK = /^https:\/\/(www\.)?(m\.me|messenger\.com|facebook\.com\/messages)\/\S+$/i;

export function isMessengerLink(value: string): boolean {
  return GC_LINK.test(value.trim());
}

const phone = z
  .string()
  .transform(normalizePhone)
  .refine((d) => d.length === 10, 'Enter a 10-digit phone number.');

export const riderSchema = z.object({
  riderName: z.string().trim().min(2, 'Enter your name.').max(60, 'Name is too long.'),
  phone,
  messenger: z.string().trim().max(100, 'That Messenger name is too long.'),
  pickupId: z.string().min(1, 'Choose a pickup spot.'),
  notes: z.string().trim().max(200, 'Keep notes under 200 characters.'),
});

export const driverProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(60),
  phone,
  carDescription: z.string().trim().min(2, 'Describe your car so riders can find it.').max(80),
  seats: z.coerce.number().int().min(1, 'At least 1 seat.').max(12, 'That is a lot of seats.'),
});

export const offerSchema = z.object({
  eventId: z.string().min(1, 'Choose a ride.'),
  seats: z.coerce.number().int().min(1, 'At least 1 seat.').max(12),
  departTime: z.string().min(1, 'Choose when you leave.'),
  gcJoinLink: z
    .string()
    .trim()
    .refine((v) => v === '' || isMessengerLink(v), 'Paste a Messenger group link (starts with https://m.me/).'),
});

export const eventSchema = z
  .object({
    category: z.enum(['church', 'cl', 'event']),
    title: z.string().trim().min(2, 'Name the event.').max(80),
    description: z.string().trim().max(400),
    startsAt: z.string().min(1, 'Choose a start time.'),
    endsAt: z.string().min(1, 'Choose an end time.'),
    destination: z.string().trim().min(2, 'Where is it?').max(120),
  })
  .refine((e) => new Date(e.endsAt) > new Date(e.startsAt), {
    message: 'End time must be after the start time.',
    path: ['endsAt'],
  });

/** Turns a Zod error into { fieldName: 'message' } for showing under inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const seriesSchema = z
  .object({
    category: z.enum(['church', 'cl']),
    title: z.string().trim().min(2, 'Name it, e.g. "First service".').max(80),
    description: z.string().trim().max(400),
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time.'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time.'),
    destination: z.string().trim().max(120),
    active: z.boolean(),
  })
  .refine((s) => s.endTime !== s.startTime, { message: 'End time must be different from the start time.', path: ['endTime'] });

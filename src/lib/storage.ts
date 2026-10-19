// Everything the site remembers on the rider's own device.
// localStorage can be unavailable (private browsing, blocked storage), so
// every read and write is wrapped in try/catch and falls back gracefully.

export interface SavedProfile {
  riderName: string;
  phone: string;
  messenger: string;
  pickupId: string;
}

const PROFILE_KEY = 'lbc-rides:profile';
const TOKENS_KEY = 'lbc-rides:tokens';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the site still works, it just won't remember */
  }
}

export function loadProfile(): SavedProfile | null {
  return read<SavedProfile | null>(PROFILE_KEY, null);
}

export function saveProfile(profile: SavedProfile): void {
  write(PROFILE_KEY, profile);
}

export function forgetProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

/** Secret tokens for rides this device signed up for (used by "My rides"). */
export function loadRideTokens(): string[] {
  return read<string[]>(TOKENS_KEY, []);
}

export function addRideToken(token: string): void {
  const tokens = loadRideTokens();
  if (!tokens.includes(token)) write(TOKENS_KEY, [token, ...tokens].slice(0, 50));
}

export function removeRideToken(token: string): void {
  write(
    TOKENS_KEY,
    loadRideTokens().filter((t) => t !== token),
  );
}

// "Keep me signed in on this device"
// Supabase already remembers a signed-in driver on this device. When someone
// unticks the box (e.g. on a friend's phone), we mark the sign-in as
// "this visit only" and sign them out the next time the site is opened.
const SESSION_ONLY_KEY = 'lbc-rides:session-only';
const ALIVE_KEY = 'lbc-rides:alive';

export function setKeepSignedIn(keep: boolean): void {
  try {
    if (keep) localStorage.removeItem(SESSION_ONLY_KEY);
    else localStorage.setItem(SESSION_ONLY_KEY, '1');
    sessionStorage.setItem(ALIVE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** True when the last sign-in was "this visit only" and the browser has since been closed. */
export function shouldEndOldSession(): boolean {
  try {
    const ended = localStorage.getItem(SESSION_ONLY_KEY) === '1' && sessionStorage.getItem(ALIVE_KEY) !== '1';
    if (ended) localStorage.removeItem(SESSION_ONLY_KEY);
    return ended;
  } catch {
    return false;
  }
}

/** Remembers the last email used to sign in, to fill it in next time. */
const LAST_EMAIL_KEY = 'lbc-rides:driver-email';
export const loadLastEmail = (): string => read<string>(LAST_EMAIL_KEY, '');
export const saveLastEmail = (email: string): void => write(LAST_EMAIL_KEY, email);

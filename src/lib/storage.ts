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

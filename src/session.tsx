import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Session } from './types';

const SessionContext = createContext<{ session: Session; ready: boolean }>({ session: null, ready: false });

/** Keeps track of who is signed in (driver, admin, or nobody) for the whole app. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void api.getSession().then((s) => {
      setSession(s);
      setReady(true);
    });
    return api.onSessionChange(setSession);
  }, []);

  return <SessionContext.Provider value={{ session, ready }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext).session;
export const useSessionReady = () => useContext(SessionContext).ready;

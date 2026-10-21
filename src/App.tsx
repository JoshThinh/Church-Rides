import { useEffect } from 'react';
import { needsNewPassword } from './lib/storage';
import { NewPassword } from './pages/NewPassword';
import { api } from './api';
import { resetDemo } from './api/demo';
import { Header } from './components/Header';
import { Empty } from './components/ui';
import { About } from './pages/About';
import { Admin } from './pages/Admin';
import { Drive } from './pages/Drive';
import { Home } from './pages/Home';
import { MyRides } from './pages/MyRides';
import { RideList } from './pages/RideList';
import { RidePage } from './pages/RidePage';
import { navigate, useRoute } from './router';
import { SessionProvider, useSession } from './session';
import type { Category } from './types';

const CATEGORIES: Category[] = ['church', 'cl', 'event'];

function Page({ route }: { route: string[] }) {
  const [section, id] = route;
  switch (section) {
    case undefined:
      return <Home />;
    case 'rides':
      return CATEGORIES.includes(id as Category) ? <RideList category={id as Category} /> : <NotFound />;
    case 'ride':
      return id ? <RidePage key={id} eventId={id} /> : <NotFound />;
    case 'my-rides':
      return <MyRides />;
    case 'drive':
      return <Drive />;
    case 'admin':
      return <Admin />;
    case 'about':
      return <About />;
    case 'new-password':
      return <NewPassword />;
    default:
      return <NotFound />;
  }
}

/** After a driver opens a password-reset email link, send them to "Choose a new password". */
function RecoveryWatcher({ route }: { route: string[] }) {
  const session = useSession();
  useEffect(() => {
    if (session?.role === 'driver' && needsNewPassword() && route[0] !== 'new-password') navigate('/new-password');
  }, [session, route]);
  return null;
}

function NotFound() {
  return (
    <div className="page">
      <Empty title="That page doesn't exist.">
        <a className="btn btn--primary" href="#/">
          Go to all rides
        </a>
      </Empty>
    </div>
  );
}

export default function App() {
  const route = useRoute();

  // Move focus to the page heading after navigating, for screen readers and keyboards.
  const path = route.join('/');
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [path]);

  return (
    <SessionProvider>
      {/* A button, not href="#main", because the # part of the URL is used for page routing. */}
      <button className="skip-link" onClick={() => document.getElementById('main')?.focus()}>
        Skip to content
      </button>
      <RecoveryWatcher route={route} />
      <Header route={route} />
      {api.mode === 'demo' && import.meta.env.PROD && (
        <p className="prod-warning" role="alert">
          This site isn't connected to the ride database. Sign-ups won't be shared. Tell a ride coordinator.
        </p>
      )}
      {api.mode === 'demo' && !import.meta.env.PROD && (
        <div className="demo-banner" role="note">
          <span>Demo mode: sign-ups are saved only in this browser.</span>
          <button
            className="link-button"
            onClick={() => {
              resetDemo();
              window.location.reload();
            }}
          >
            Reset demo
          </button>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        <Page route={route} />
      </main>
    </SessionProvider>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';

/** Top bar with the wordmark and the ☰ menu that slides in from the right. */
export function Header({ route }: { route: string[] }) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the menu whenever the page changes.
  const page = route.join('/');
  useEffect(() => setOpen(false), [page]);

  // While open: Escape closes, focus moves into the menu, page can't scroll behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const button = buttonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      button?.focus();
    };
  }, [open]);

  const current = route[0] ?? '';
  const link = (to: string, label: string, sub?: string) => (
    <li>
      <a href={`#/${to}`} aria-current={current === to ? 'page' : undefined}>
        <span className="menu__label">{label}</span>
        {sub && <span className="menu__sub">{sub}</span>}
      </a>
    </li>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <a className="wordmark" href="#/" aria-label="LBC Rides home">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
              <path d="M5 23 C 11 23, 11 9, 16 9 S 21 23, 27 23" fill="none" stroke="var(--route)" strokeWidth="3.2" strokeLinecap="round" />
              <circle cx="5" cy="23" r="3.4" fill="currentColor" />
              <circle cx="27" cy="23" r="3.4" fill="currentColor" />
            </svg>
            <span>LBC Rides</span>
          </a>
          <button
            ref={buttonRef}
            className="menu-button"
            aria-expanded={open}
            aria-controls="main-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="menu-button__bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </header>

      <div className={`scrim${open ? ' is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav
        id="main-menu"
        ref={panelRef}
        className={`menu${open ? ' is-open' : ''}`}
        aria-label="Main menu"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="menu__head">
          <span className="menu__title">Menu</span>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="menu__list">
          {link('', 'Find a ride', 'Church, College Life, and events')}
          {link('my-rides', 'My rides', 'Rides you signed up for on this device')}
          {link('drive', 'Drive / register my car', 'Offer seats and see your riders')}
          {link('admin', session?.role === 'admin' ? 'Admin' : 'Admin login', 'Add and edit events')}
          {link('about', 'How it works')}
        </ul>
        {session && (
          <div className="menu__foot">
            <p>
              Signed in as {session.role === 'admin' ? 'admin' : session.email}
            </p>
            <button className="btn btn--ghost btn--small" onClick={() => void api.signOut()}>
              Sign out
            </button>
          </div>
        )}
      </nav>
    </>
  );
}

import type { ReactNode } from 'react';
import type { Category } from '../types';
import { dateParts } from '../lib/format';

/** Label + input + error message, wired up for screen readers. */
export function Field(props: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  const { id, label, hint, error, children } = props;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Calendar-style date block, tinted with the ride's category color. */
export function DateBlock({ iso, category }: { iso: string; category: Category }) {
  const { month, day, weekday } = dateParts(iso);
  return (
    <div className={`date-block cat-${category}`} aria-hidden="true">
      <span className="date-block__month">{month}</span>
      <span className="date-block__day">{day}</span>
      <span className="date-block__weekday">{weekday}</span>
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <span className="loading__dot" />
      {label}…
    </p>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="note note--error" role="alert">
      {message}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="page-title">
      <h1 tabIndex={-1}>{children}</h1>
      {sub && <p className="page-title__sub">{sub}</p>}
    </header>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="back-link" href={`#${to}`}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </a>
  );
}

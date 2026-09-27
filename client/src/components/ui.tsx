import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { STATE_LABEL, type ItemState } from '@smaran/shared';
import { Icon } from './Icon';
import { useSync } from '../lib/sync';
import { getSession, problemText } from '../lib/api';
import { AccountSheet } from './AccountSheet';

/** A suggestion's state, shown by shape as well as colour. */
export function Mark({ state }: { state: ItemState }) {
  return (
    <span className={`mk mk-${state}`} aria-hidden="true">
      {state === 'done' && <Icon name="check" />}
    </span>
  );
}

export function StateLegend() {
  return (
    <div className="legend">
      {(['done', 'partly', 'notyet', 'pending'] as const).map((k) => (
        <span key={k}>
          <Mark state={k} />
          {STATE_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

const STEPS = ['Brief', 'Observe', 'Review', 'Saved'];

/** The four steps of a visit: a real sequence, so it is numbered. */
export function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="steps" aria-label="Visit steps">
      {STEPS.map((label, i) => (
        <li key={label} className={i + 1 < current ? 'done' : i + 1 === current ? 'on' : ''} aria-current={i + 1 === current ? 'step' : undefined}>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function TopBar({ back, backTo, right, ruled }: { back?: string; backTo?: string; right?: ReactNode; ruled?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className={`top${ruled ? ' ruled' : ''}`}>
      {back && (
        <button className="back" onClick={() => (backTo ? navigate(backTo) : navigate(-1))}>
          <Icon name="back" />
          {back}
        </button>
      )}
      <span className="spacer" />
      {right}
    </header>
  );
}

/** Header for the three main tabs: brand or title, sync state, account. */
export function TabHeader({ title }: { title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="top">
      {title ? (
        <span className="brand">{title}</span>
      ) : (
        <span className="brand">
          Smaran <span lang="hi">स्मरण</span>
        </span>
      )}
      <SyncChip />
      <AccountButton onClick={() => setOpen(true)} />
      {open && <AccountSheet onClose={() => setOpen(false)} />}
    </header>
  );
}

function AccountButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="acct" onClick={onClick} aria-label="Account and settings">
      <AccountInitial />
    </button>
  );
}

function AccountInitial() {
  return <>{getSession()?.mentor.firstName.charAt(0) ?? '·'}</>;
}

export function SyncChip() {
  const { offline, queue, syncing } = useSync();
  const n = queue.length;
  const notes = `${n} ${n === 1 ? 'note' : 'notes'}`;
  if (offline)
    return (
      <span className="sync off">
        <Icon name="cloudOff" small /> {n ? `No signal, ${notes} kept on phone` : 'No signal'}
      </span>
    );
  if (n)
    return (
      <span className="sync">
        <Icon name="cloud" small /> {syncing ? `Syncing ${notes}` : `${notes} waiting to sync`}
      </span>
    );
  return (
    <span className="sync">
      <Icon name="cloud" small /> All notes synced
    </span>
  );
}

export function TabBar() {
  const tabs = [
    { to: '/', label: 'Today', icon: 'route' as const, end: true },
    { to: '/schools', label: 'Schools', icon: 'school' as const, end: false },
    { to: '/patterns', label: 'Patterns', icon: 'grid' as const, end: false },
  ];
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="tab">
          <Icon name={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Loading() {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

export function Problem({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="problem" role="alert">
      <b>This didn’t load</b>
      <p>{problemText(error)}</p>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function StaleNote({ show }: { show: boolean }) {
  return show ? <p className="stale">Showing what was saved on this phone. It will refresh when there is signal.</p> : null;
}

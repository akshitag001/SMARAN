import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { RESPONSE_LABEL, STATE_LABEL, shortDate, type ItemState, type Role, type TeacherResponse } from '@smaran/shared';
import { Icon, type IconName } from './Icon';
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

/** What the teacher said about a suggestion since the visit. */
export function TeacherReplies({ responses }: { responses: TeacherResponse[] }) {
  if (!responses.length) return null;
  const latest = responses[0];
  return (
    <div className={`reply reply-${latest.status}`}>
      <b>
        {latest.teacherName}: {RESPONSE_LABEL[latest.status]}
      </b>
      {latest.note && <span>“{latest.note}”</span>}
      <small>
        {shortDate(latest.createdAt.slice(0, 10))}
        {responses.length > 1 ? `, and ${responses.length - 1} earlier ${responses.length === 2 ? 'reply' : 'replies'}` : ''}
      </small>
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

/** Header for the main tabs: brand or title, sync state, account. */
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
      <button className="acct" onClick={() => setOpen(true)} aria-label="Account and settings">
        {getSession()?.user.firstName.charAt(0) ?? '·'}
      </button>
      {open && <AccountSheet onClose={() => setOpen(false)} />}
    </header>
  );
}

export function SyncChip() {
  const { offline, queue, syncing } = useSync();
  const n = queue.length;
  const items = `${n} ${n === 1 ? 'item' : 'items'}`;
  if (offline)
    return (
      <span className="sync off">
        <Icon name="cloudOff" small /> {n ? `No signal, ${items} on phone` : 'No signal'}
      </span>
    );
  if (n)
    return (
      <span className="sync">
        <Icon name="cloud" small /> {syncing ? `Syncing ${items}` : `${items} to sync`}
      </span>
    );
  return (
    <span className="sync">
      <Icon name="cloud" small /> Synced
    </span>
  );
}

const TABS: Record<Role, { to: string; label: string; icon: IconName; end?: boolean }[]> = {
  crp: [
    { to: '/', label: 'Today', icon: 'route', end: true },
    { to: '/schools', label: 'Schools', icon: 'school' },
    { to: '/patterns', label: 'Patterns', icon: 'grid' },
    { to: '/inbox', label: 'Inbox', icon: 'bell' },
  ],
  brc: [
    { to: '/', label: 'Block', icon: 'block', end: true },
    { to: '/schools', label: 'Schools', icon: 'school' },
    { to: '/people', label: 'People', icon: 'people' },
    { to: '/patterns', label: 'Patterns', icon: 'grid' },
    { to: '/inbox', label: 'Inbox', icon: 'bell' },
  ],
  teacher: [
    { to: '/', label: 'Feedback', icon: 'note', end: true },
    { to: '/inbox', label: 'Inbox', icon: 'bell' },
  ],
};

export function TabBar() {
  const role = getSession()?.user.role ?? 'crp';
  const { unread } = useSync();
  const tabs = TABS[role];
  return (
    <nav className="tabs" aria-label="Sections" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="tab">
          <span className="tab-ic">
            <Icon name={t.icon} />
            {t.to === '/inbox' && unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
          </span>
          {t.label}
          {t.to === '/inbox' && unread > 0 && <span className="vh">, {unread} unread</span>}
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

/** A short confirmation line that fades after a few seconds. */
export function useToast(): [string, (msg: string) => void] {
  const [msg, setMsg] = useState('');
  const show = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(''), 3500);
  };
  return [msg, show];
}

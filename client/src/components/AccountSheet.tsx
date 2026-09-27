import { useEffect, useRef } from 'react';
import { getSession, setSession } from '../lib/api';
import { useSync } from '../lib/sync';

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const session = getSession();
  const { workOffline, setWorkOffline, queue } = useSync();
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signOut = () => {
    setSession(null);
    window.dispatchEvent(new Event('smaran:signed-out'));
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Account" onClick={(e) => e.stopPropagation()}>
        <h2>{session?.mentor.name}</h2>
        <p className="who">
          <span>{session?.mentor.role}, {session?.cluster.name}</span>
          <span>{session?.cluster.block} block, {session?.cluster.district}</span>
        </p>
        <button ref={first} className="toggle" role="switch" aria-checked={workOffline} onClick={() => setWorkOffline(!workOffline)}>
          <span>
            Work offline
            <small>Keep notes on the phone and draft here. Saves mobile data.</small>
          </span>
          <span className="sw" aria-hidden="true" />
        </button>
        {queue.length > 0 && (
          <p className="hint">
            {queue.length} {queue.length === 1 ? 'visit is' : 'visits are'} saved on this phone and will sync when there is signal.
            Signing out keeps them.
          </p>
        )}
        <button className="btn btn-secondary" onClick={signOut}>
          Sign out
        </button>
        <button className="btn btn-text" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ROLE_LABEL } from '@smaran/shared';
import { getSession, setSession } from '../lib/api';
import { useSync } from '../lib/sync';

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const session = getSession();
  const navigate = useNavigate();
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

  if (!session) return null;
  const { user, block, cluster, school } = session;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Account" onClick={(e) => e.stopPropagation()}>
        <h2>{user.name}</h2>
        <p className="who">
          <span>{ROLE_LABEL[user.role]}</span>
          <span>{school ? school.name : cluster ? cluster.name : `${block.name} block`}, {block.district}</span>
        </p>
        <button ref={first} className="toggle" role="switch" aria-checked={workOffline} onClick={() => setWorkOffline(!workOffline)}>
          <span>
            Work offline
            <small>Keep everything on the phone and sync later. Saves mobile data.</small>
          </span>
          <span className="sw" aria-hidden="true" />
        </button>
        {queue.length > 0 && (
          <p className="hint">
            {queue.length} {queue.length === 1 ? 'item is' : 'items are'} saved on this phone and will sync when there is signal. Signing out keeps them.
          </p>
        )}
        {user.role === 'crp' && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              onClose();
              navigate('/handover');
            }}
          >
            Hand over my schools
          </button>
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

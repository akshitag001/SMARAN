import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cachedGet, isOffline, isWorkingOffline, setWorkingOffline } from './api';
import { flushOutbox, listOutbox, onOutboxChange, type OutboxEntry } from './outbox';

interface SyncState {
  offline: boolean;
  workOffline: boolean;
  setWorkOffline: (v: boolean) => void;
  queue: OutboxEntry[];
  syncing: boolean;
  syncNow: () => void;
  /** Unread inbox items, refreshed while there is signal. */
  unread: number;
  refreshUnread: () => void;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(isOffline());
  const [workOffline, setWork] = useState(isWorkingOffline());
  const [queue, setQueue] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    cachedGet<{ unread: number }>('/inbox/unread').then(
      ({ data }) => setUnread(data.unread),
      () => {},
    );
  }, []);

  const syncNow = useCallback(() => {
    if (isOffline()) return;
    setSyncing(true);
    flushOutbox().finally(() => setSyncing(false));
  }, []);

  useEffect(() => {
    listOutbox().then(setQueue);
    const off = onOutboxChange(setQueue);
    const update = () => {
      setOffline(isOffline());
      syncNow();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const timer = window.setInterval(() => {
      syncNow();
      refreshUnread();
    }, 30_000);
    const onInbox = () => refreshUnread();
    window.addEventListener('smaran:inbox', onInbox);
    syncNow();
    refreshUnread();
    return () => {
      off();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.clearInterval(timer);
      window.removeEventListener('smaran:inbox', onInbox);
    };
  }, [syncNow, refreshUnread]);

  // Anything newly queued is sent straight away when there is signal.
  useEffect(() => {
    if (queue.some((e) => !e.lastError)) syncNow();
  }, [queue, syncNow]);

  const setWorkOffline = useCallback(
    (v: boolean) => {
      setWorkingOffline(v);
      setWork(v);
      setOffline(isOffline());
      if (!v) syncNow();
    },
    [syncNow],
  );

  return (
    <SyncContext.Provider value={{ offline, workOffline, setWorkOffline, queue, syncing, syncNow, unread, refreshUnread }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync outside SyncProvider');
  return ctx;
}

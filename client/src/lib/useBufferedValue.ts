import { useEffect, useRef, useState } from 'react';

/**
 * Local state for a text field whose value lives in an external store.
 * Typing goes through React state (so no keystrokes are lost) and is committed
 * to the store on every change; changes made elsewhere (voice typing) flow back in.
 */
export function useBufferedValue(external: string, commit: (v: string) => void): [string, (v: string) => void] {
  const [local, setLocal] = useState(external);
  const committed = useRef(external);

  useEffect(() => {
    if (external !== committed.current) {
      committed.current = external;
      setLocal(external);
    }
  }, [external]);

  const change = (v: string) => {
    committed.current = v;
    setLocal(v);
    commit(v);
  };
  return [local, change];
}

import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { firstName, isoDate, localDraft, type BriefResponse, type DraftResponse } from '@smaran/shared';
import { Steps } from '../components/ui';
import { OfflineError, newClientId, post } from '../lib/api';
import { useFlow } from '../lib/flow';
import { useData } from '../lib/useData';

const MIN_PAUSE_MS = 1200;
// After this, the phone stops waiting for the server and drafts on its own.
const GIVE_UP_MS = 40_000;

/** A short, honest pause while the note becomes a draft. */
export function Drafting() {
  const { schoolId = '' } = useParams();
  const navigate = useNavigate();
  const { flow, update } = useFlow();
  const { data } = useData<BriefResponse>(`/schools/${schoolId}/brief?date=${isoDate()}`);
  const request = useRef<AbortController | null>(null);
  const [slow, setSlow] = useState(false);
  const ready = flow.schoolId === schoolId && flow.note.trim().length > 0;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const ctl = new AbortController();
    request.current = ctl;
    const started = Date.now();
    const slowTimer = window.setTimeout(() => setSlow(true), 12_000);
    const giveUp = window.setTimeout(() => ctl.abort(), GIVE_UP_MS);

    (async () => {
      let result: DraftResponse;
      try {
        result = await post<DraftResponse>('/drafts', { schoolId, note: flow.note, lang: flow.lang, checks: flow.checks }, ctl.signal);
      } catch (err) {
        if (cancelled) return;
        result = { draft: localDraft(flow.note, flow.lang), source: err instanceof OfflineError ? 'offline' : 'local' };
      }
      await new Promise((r) => window.setTimeout(r, Math.max(0, MIN_PAUSE_MS - (Date.now() - started))));
      if (cancelled) return;
      // Reminders found in the note join any the mentor already added; the mentor can drop them in review.
      const added = flow.reminders.filter((r) => r.source === 'added');
      const found = (result.draft.reminders ?? [])
        .filter((text) => !added.some((a) => a.text.toLowerCase() === text.toLowerCase()))
        .map((text) => ({ clientId: newClientId(), text, source: 'note' as const }));
      update({ draft: result.draft, source: result.source, reminders: [...added, ...found] });
      navigate(`/visit/${schoolId}/review`, { replace: true });
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      window.clearTimeout(giveUp);
      ctl.abort();
    };
    // Draft once each time this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return <Navigate to={`/visit/${schoolId}/observe`} replace />;

  const skip = () => {
    request.current?.abort();
    update({ draft: { strength: '', actions: [{ do: '', how: '' }], summary: '', reminders: [] }, source: 'self' });
    navigate(`/visit/${schoolId}/review`, { replace: true });
  };

  const note = flow.note.length > 220 ? flow.note.slice(0, 220) + '…' : flow.note;
  return (
    <>
      <header className="top" />
      <main>
        <Steps current={3} />
        <section className="drafting" aria-live="polite">
          <h1>Turning your note into feedback{data ? ` for ${firstName(data.school.teacher)} ji` : ''}</h1>
          <p className="quote">{note}</p>
          <div className="writing" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <p className="muted" style={{ fontSize: 15 }}>
            {slow
              ? 'Taking longer than usual on this connection. You can write it yourself instead.'
              : 'Usually a few seconds. Your note is already saved on this phone.'}
          </p>
        </section>
      </main>
      <footer className="bar">
        <button className="btn btn-secondary" onClick={skip}>
          Skip and write it myself
        </button>
      </footer>
    </>
  );
}

import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { MONTHS_SHORT, STATE_LABEL, isoDate, parseDate, plural, withoutHonorific, type BriefResponse, type TodayResponse } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Mark, Steps, SyncChip } from '../components/ui';
import { getSession } from '../lib/api';
import { copyToClipboard, feedbackText } from '../lib/feedbackText';
import { useFlow } from '../lib/flow';
import { useSync } from '../lib/sync';
import { useData } from '../lib/useData';

export function Saved() {
  const { schoolId = '' } = useParams();
  const navigate = useNavigate();
  const { flow, clear } = useFlow();
  const today = isoDate();
  const brief = useData<BriefResponse>(`/schools/${schoolId}/brief?date=${today}`);
  const route = useData<TodayResponse>(`/today?date=${today}`);
  const { queue } = useSync();
  const [toast, setToast] = useState('');

  if (flow.schoolId !== schoolId || !flow.saved) return <Navigate to={`/schools/${schoolId}`} replace />;
  const { visit, closed } = flow.saved;
  const school = brief.data?.school;
  const n = visit.items.length;
  const d = parseDate(visit.date);

  // Next stop on today's route that isn't visited, counting visits kept on the phone.
  const done = new Set([schoolId, ...queue.filter((e) => e.request.date === today).map((e) => e.request.schoolId)]);
  const next = route.data?.stops.find((s) => !s.visit && !done.has(s.school.id));

  // Leave first, then forget the finished visit, so this screen never re-renders without it.
  const leave = (to: string) => {
    navigate(to, { replace: true });
    window.setTimeout(clear, 0);
  };

  const copy = async () => {
    const session = getSession();
    if (!school || !session || !flow.draft) return;
    const ok = await copyToClipboard(
      feedbackText({ teacher: school.teacher, date: visit.date, draft: flow.draft, lang: flow.lang, mentor: session.mentor, cluster: session.cluster }),
    );
    setToast(ok ? 'Copied. Paste it into WhatsApp.' : 'Copy isn’t available here.');
    window.setTimeout(() => setToast(''), 3500);
  };

  return (
    <>
      <header className="top" />
      <main>
        <Steps current={4} />
        <section className="saved">
          <div className="stamp press" role="img" aria-label={`Saved to school record, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`}>
            <span>{flow.saved.queued ? 'Saved on phone' : 'Saved to record'}</span>
            <strong>
              {String(d.getDate()).padStart(2, '0')} {MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}
            </strong>
            <span>{school?.name ?? ''}</span>
          </div>
          <h1>
            Feedback saved for <span className="name">{school ? withoutHonorific(school.teacher) : 'the teacher'}</span>
          </h1>
          <p>
            {n ? `${plural(n, 'suggestion')} ${n === 1 ? 'is' : 'are'} now` : 'This visit is now'} on {school?.name ?? 'the school'}’s record.{' '}
            {n ? `${n === 1 ? 'It' : 'They'} will come up at the next visit, whoever makes it.` : ''}
          </p>
          {closed.length > 0 && (
            <div className="sec">
              <h2>Closed from last visit</h2>
              <ul className="closed">
                {closed.map((c) => (
                  <li key={c.id}>
                    <Mark state={c.state} />
                    <span>
                      {c.text}
                      <br />
                      <span className="muted" style={{ fontSize: 14 }}>
                        {STATE_LABEL[c.state]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <SyncChip />
          </div>
          <div className="tools" style={{ marginTop: 0 }}>
            <button onClick={copy}>
              <Icon name="copy" small />
              Copy feedback for WhatsApp
            </button>
            <button onClick={() => leave(`/schools/${schoolId}`)}>See this school’s record</button>
          </div>
          <p className="toast" aria-live="polite">
            {toast}
          </p>
        </section>
      </main>
      <footer className="bar">
        {next && (
          <button className="btn btn-primary" onClick={() => leave(`/visit/${next.school.id}`)}>
            Next:&nbsp;<span className="name" style={{ fontWeight: 400 }}>{next.school.name}</span>
          </button>
        )}
        <button className={`btn ${next ? 'btn-text' : 'btn-primary'}`} onClick={() => leave('/')}>
          Back to today
        </button>
      </footer>
    </>
  );
}

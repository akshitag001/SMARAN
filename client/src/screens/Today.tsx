import { Link } from 'react-router';
import { isoDate, parseDate, MONTHS, WEEKDAYS, plural, shortDate, withoutHonorific, type Reminder, type RouteStop, type TodayResponse } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader } from '../components/ui';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';
import type { OutboxEntry } from '../lib/outbox';
import { queuedVisits } from '../lib/visits';

/** Route stops, with visits saved on this phone but not yet synced counted as done. */
function withQueuedVisits(stops: RouteStop[], queue: OutboxEntry[], date: string): RouteStop[] {
  return stops.map((s) => {
    if (s.visit) return s;
    const q = queuedVisits(queue).find((e) => e.request.schoolId === s.school.id && e.request.date === date);
    return q
      ? { ...s, visit: { time: q.request.time, savedCount: q.local.visit.items.length, checkedCount: q.local.closed.length } }
      : s;
  });
}

export function Today() {
  const date = isoDate();
  const { data, error, loading, fromCache, reload } = useData<TodayResponse>(`/today?date=${date}`);
  const { queue } = useSync();
  const d = parseDate(date);

  const stops = data ? withQueuedVisits(data.stops, queue, date) : [];
  const done = stops.filter((s) => s.visit).length;
  const allDone = stops.length > 0 && done === stops.length;
  const next = stops.find((s) => !s.visit);

  return (
    <>
      <TabHeader />
      <main>
        {data && (
          <div className="greet">
            <h1>Namaste, {data.user.firstName}</h1>
            <p>
              {WEEKDAYS[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]}.{' '}
              {allDone ? 'Your route is done for today.' : `${stops.length} schools on today’s route.`}
            </p>
          </div>
        )}
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && stops.length === 0 && (
          <div className="empty-note">
            <b>No schools assigned to you yet</b>
            <span>Your block coordinator assigns schools. They will appear here, with today’s route, once they do.</span>
          </div>
        )}
        {data && allDone && <EndOfDay stops={stops} queued={queue.length} />}
        {data && !allDone && (
          <>
            <section className="progress" aria-label="Today’s progress">
              <div className="progress-row">
                <span>
                  <b className="num">
                    {done} of {stops.length}
                  </b>{' '}
                  schools visited
                </span>
                <span>{data.cluster?.name.replace('Jan Shiksha Kendra', 'JSK')}</span>
              </div>
              <div className="segs" aria-hidden="true">
                {stops.map((s) => (
                  <i key={s.school.id} className={s.visit ? 'on' : ''} />
                ))}
              </div>
            </section>
            <section aria-label="Today’s route">
              <ol className="route">
                {stops.map((s) => (
                  <RouteRow key={s.school.id} stop={s} isNext={s === next} today={date} />
                ))}
              </ol>
            </section>
          </>
        )}
        {data && data.reminders.length > 0 && <Reminders reminders={data.reminders} />}
      </main>
      <TabBar />
    </>
  );
}

function RouteRow({ stop, isNext, today }: { stop: RouteStop; isNext: boolean; today: string }) {
  const { school, visit } = stop;
  return (
    <li>
      <Link className="row" to={visit ? `/schools/${school.id}` : `/visit/${school.id}`}>
        <span className={`ord ${visit ? 'done' : isNext ? 'next' : ''}`} aria-hidden="true">
          {visit ? <Icon name="check" /> : stop.position}
        </span>
        <span className="row-main">
          {isNext && <span className="next-tag">Next</span>}
          <span className="row-name name">{school.name}</span>
          <span className="row-meta">
            {withoutHonorific(school.teacher)}, {school.classLabel.replace(' (multigrade)', '')} {school.subject}
          </span>
          <span className="row-foot">
            {visit ? (
              <>
                <span className="muted">Visited {visit.time}</span>
                <span className="chip chip-done">{plural(visit.savedCount, 'suggestion')} saved</span>
              </>
            ) : (
              <>
                <span className="muted">{school.lastVisitDate ? `Last visit ${shortDate(school.lastVisitDate, today)}` : 'No visits on record'}</span>
                {school.toCheck > 0 && <span className="chip chip-look">{plural(school.toCheck, 'item')} to check</span>}
              </>
            )}
          </span>
        </span>
        <Icon name="chev" />
      </Link>
    </li>
  );
}

function EndOfDay({ stops, queued }: { stops: RouteStop[]; queued: number }) {
  const suggestions = stops.reduce((a, s) => a + (s.visit?.savedCount ?? 0), 0);
  const checked = stops.reduce((a, s) => a + (s.visit?.checkedCount ?? 0), 0);
  const last = stops[stops.length - 1].visit?.time;
  return (
    <section className="eod" aria-label="Day summary">
      <svg className="book" viewBox="0 0 120 84" aria-hidden="true">
        <rect x="10" y="8" width="96" height="68" rx="3" style={{ fill: 'var(--surface)', stroke: 'var(--ink-3)' }} strokeWidth="2" />
        <rect x="10" y="8" width="14" height="68" rx="3" style={{ fill: 'var(--quink)' }} />
        <path d="M34 26h58M34 36h58M34 46h58M34 56h40" style={{ stroke: 'var(--rule-strong)' }} strokeWidth="2" strokeLinecap="round" />
        <path d="M84 8v34l7-6 7 6V8" style={{ fill: 'var(--marigold)' }} />
      </svg>
      <h2>Day closed{last ? ` at ${last}` : ''}</h2>
      <p>
        You observed {stops.length} classes and left {plural(suggestions, 'suggestion')}. Each one is on its school’s record now, so
        whoever visits next will see it first.
      </p>
      <dl className="ledger">
        <div>
          <dt>Schools visited</dt>
          <dd>
            {stops.length} of {stops.length}
          </dd>
        </div>
        <div>
          <dt>Suggestions recorded</dt>
          <dd>{suggestions}</dd>
        </div>
        <div>
          <dt>Earlier suggestions checked</dt>
          <dd>{checked}</dd>
        </div>
        <div>
          <dt>Notes waiting to sync</dt>
          <dd>{queued}</dd>
        </div>
      </dl>
      <ol className="dayline" aria-label="Visits today">
        {stops.map((s) => (
          <li key={s.school.id}>
            <time>{s.visit?.time}</time>
            <Link className="linkish" to={`/schools/${s.school.id}`}>
              <span className="name">{s.school.name}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Reminders waiting at the CRP's schools, from their own notes, the previous CRP or the coordinator. */
function Reminders({ reminders }: { reminders: Reminder[] }) {
  return (
    <section className="sec" aria-label="Reminders">
      <h2>Reminders at your schools</h2>
      <ul className="rem-list">
        {reminders.map((r) => (
          <li key={r.id}>
            <Link className="rem" to={`/visit/${r.schoolId}`}>
              <span className="rem-flag" aria-hidden="true">
                <Icon name="flag" small />
              </span>
              <span>
                <span className="rem-text">{r.text}</span>
                <small>
                  <span className="name">{r.schoolName}</span>, from {r.createdByName}, {shortDate(r.createdOn)}
                </small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

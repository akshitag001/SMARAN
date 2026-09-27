import { useNavigate } from 'react-router';
import { shortDate, type InboxItem } from '@smaran/shared';
import { Icon, type IconName } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader } from '../components/ui';
import { post } from '../lib/api';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';

const KIND_ICON: Record<InboxItem['kind'], IconName> = {
  feedback: 'note',
  response: 'people',
  handover: 'swap',
  reminder: 'flag',
  assignment: 'school',
};

/** What changed for this person: teacher replies, handovers, reminders from others, new feedback. */
export function Inbox() {
  const { data, error, loading, fromCache, reload } = useData<InboxItem[]>('/inbox');
  const { refreshUnread, queue } = useSync();
  const navigate = useNavigate();
  const unread = data?.filter((i) => !i.read).length ?? 0;
  const failed = queue.filter((e) => e.lastError);

  const open = async (item: InboxItem) => {
    if (!item.read) {
      await post('/inbox/read', { id: item.id }).catch(() => {});
      refreshUnread();
    }
    if (item.link) navigate(item.link);
    else reload();
  };

  const readAll = async () => {
    await post('/inbox/read', {}).catch(() => {});
    refreshUnread();
    reload();
  };

  return (
    <>
      <TabHeader title="Inbox" />
      <main>
        {failed.length > 0 && (
          <div className="problem" role="alert">
            <b>{failed.length === 1 ? 'One item didn’t sync' : `${failed.length} items didn’t sync`}</b>
            {failed.map((e) => (
              <p key={e.id}>{e.lastError}</p>
            ))}
            <p>They stay on this phone. Ask your block coordinator if this keeps happening.</p>
          </div>
        )}
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && data.length === 0 && (
          <div className="empty-note">
            <b>Nothing here yet</b>
            <span>Replies from teachers, handovers and reminders from colleagues will show up here.</span>
          </div>
        )}
        {data && data.length > 0 && (
          <>
            {unread > 0 && (
              <button className="add" onClick={readAll}>
                <Icon name="check" small />
                Mark all {unread} as read
              </button>
            )}
            <ul className="inbox">
              {data.map((item) => (
                <li key={item.id}>
                  <button className={`inbox-item${item.read ? '' : ' unread'}`} onClick={() => open(item)}>
                    <span className="inbox-ic" aria-hidden="true">
                      <Icon name={KIND_ICON[item.kind]} small />
                    </span>
                    <span className="inbox-main">
                      <span className="inbox-title">
                        {!item.read && <span className="vh">Unread: </span>}
                        {item.title}
                      </span>
                      {item.body && <span className="inbox-body">{item.body}</span>}
                      <span className="inbox-when">{shortDate(item.createdAt.slice(0, 10))}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

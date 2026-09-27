import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import type { Role } from '@smaran/shared';
import { getSession } from './lib/api';
import { SyncProvider } from './lib/sync';
import { BlockHome } from './screens/BlockHome';
import { Brief } from './screens/Brief';
import { Drafting } from './screens/Drafting';
import { Handover } from './screens/Handover';
import { History } from './screens/History';
import { Inbox } from './screens/Inbox';
import { Login } from './screens/Login';
import { MentorDetail } from './screens/MentorDetail';
import { Observe } from './screens/Observe';
import { Patterns } from './screens/Patterns';
import { People } from './screens/People';
import { Review } from './screens/Review';
import { Saved } from './screens/Saved';
import { Schools } from './screens/Schools';
import { TeacherHome } from './screens/TeacherHome';
import { Today } from './screens/Today';

/** The visit flow, shared by CRPs and coordinators (a coordinator can visit a school too). */
const visitRoutes = (
  <>
    <Route path="/schools" element={<Schools />} />
    <Route path="/schools/:schoolId" element={<History />} />
    <Route path="/patterns" element={<Patterns />} />
    <Route path="/handover" element={<Handover />} />
    <Route path="/visit/:schoolId" element={<Brief />} />
    <Route path="/visit/:schoolId/observe" element={<Observe />} />
    <Route path="/visit/:schoolId/drafting" element={<Drafting />} />
    <Route path="/visit/:schoolId/review" element={<Review />} />
    <Route path="/visit/:schoolId/saved" element={<Saved />} />
  </>
);

function routesFor(role: Role) {
  if (role === 'teacher') {
    return (
      <>
        <Route path="/" element={<TeacherHome />} />
        <Route path="/inbox" element={<Inbox />} />
      </>
    );
  }
  if (role === 'brc') {
    return (
      <>
        <Route path="/" element={<BlockHome />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:userId" element={<MentorDetail />} />
        <Route path="/inbox" element={<Inbox />} />
        {visitRoutes}
      </>
    );
  }
  return (
    <>
      <Route path="/" element={<Today />} />
      <Route path="/inbox" element={<Inbox />} />
      {visitRoutes}
    </>
  );
}

export function App() {
  const [session, setSessionState] = useState(() => getSession());

  useEffect(() => {
    const out = () => setSessionState(null);
    window.addEventListener('smaran:signed-out', out);
    return () => window.removeEventListener('smaran:signed-out', out);
  }, []);

  return (
    <div className="stage">
      <div className="app">
        {!session ? (
          <Login onSignedIn={() => setSessionState(getSession())} />
        ) : (
          // Keyed by user, so signing in as someone else starts clean.
          <SyncProvider key={session.user.id}>
            <BrowserRouter>
              <ScrollToTop />
              <Routes>
                {routesFor(session.user.role)}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </SyncProvider>
        )}
      </div>
    </div>
  );
}

/** Each screen opens at the top, on phones (page scroll) and wide screens (column scroll). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector('.app')?.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

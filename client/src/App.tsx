import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { getSession } from './lib/api';
import { SyncProvider } from './lib/sync';
import { Brief } from './screens/Brief';
import { Drafting } from './screens/Drafting';
import { History } from './screens/History';
import { Login } from './screens/Login';
import { Observe } from './screens/Observe';
import { Patterns } from './screens/Patterns';
import { Review } from './screens/Review';
import { Saved } from './screens/Saved';
import { Schools } from './screens/Schools';
import { Today } from './screens/Today';

export function App() {
  const [signedIn, setSignedIn] = useState(() => getSession() !== null);

  useEffect(() => {
    const out = () => setSignedIn(false);
    window.addEventListener('smaran:signed-out', out);
    return () => window.removeEventListener('smaran:signed-out', out);
  }, []);

  return (
    <div className="stage">
      <div className="app">
        {!signedIn ? (
          <Login onSignedIn={() => setSignedIn(true)} />
        ) : (
          <SyncProvider>
              <BrowserRouter>
                <ScrollToTop />
                <Routes>
                  <Route path="/" element={<Today />} />
                  <Route path="/schools" element={<Schools />} />
                  <Route path="/schools/:schoolId" element={<History />} />
                  <Route path="/patterns" element={<Patterns />} />
                  <Route path="/visit/:schoolId" element={<Brief />} />
                  <Route path="/visit/:schoolId/observe" element={<Observe />} />
                  <Route path="/visit/:schoolId/drafting" element={<Drafting />} />
                  <Route path="/visit/:schoolId/review" element={<Review />} />
                  <Route path="/visit/:schoolId/saved" element={<Saved />} />
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

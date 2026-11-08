// Path: web/src/App.jsx
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RulesPage from './pages/RulesPage.jsx';
import AgentPage from './pages/AgentPage.jsx';
import ApprovalsPage from './pages/ApprovalsPage.jsx';
// AG Grid is large: load it only when the Activity page is opened
const ActivityPage = lazy(() => import('./pages/ActivityPage.jsx'));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/agent" replace />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route
          path="/activity"
          element={
            <Suspense fallback={<p className="pt-8 text-graphite">Loading activity</p>}>
              <ActivityPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/agent" replace />} />
      </Route>
    </Routes>
  );
}

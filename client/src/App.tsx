import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { TeamsPage } from './pages/Teams';
import { TeamDetailPage } from './pages/TeamDetail';
import { DraftPage } from './pages/Draft';
import { CompsPage } from './pages/Comps';
import { HistoryPage } from './pages/History';

export function App() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          Draft <b>Politécnica</b>
        </div>
        <nav className="nav">
          <NavLink to="/draft">Draft</NavLink>
          <NavLink to="/equipos">Equipos</NavLink>
          <NavLink to="/comps">Comps</NavLink>
          <NavLink to="/historial">Historial</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/draft" replace />} />
          <Route path="/draft" element={<DraftPage />} />
          <Route path="/equipos" element={<TeamsPage />} />
          <Route path="/equipos/:id" element={<TeamDetailPage />} />
          <Route path="/comps" element={<CompsPage />} />
          <Route path="/historial" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/draft" replace />} />
        </Routes>
      </main>
    </>
  );
}

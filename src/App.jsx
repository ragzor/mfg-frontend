import { useState, useEffect, Component } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import PartsTable from './components/PartsTable';
import NewPartModal from './components/NewPartModal';
import LoginPage from './components/LoginPage';
import SettingsModal from './components/SettingsModal';
import ListEditor from './components/ListEditor';
import GanttChart from './components/GanttChart';
import Dashboard from './components/Dashboard';
import ResourceView from './components/ResourceView';
import ProcessTracking from './components/ProcessTracking';
import NewWeldingModal from './components/NewWeldingModal';
import CostingReport from './components/CostingReport';
import { useParts } from './hooks/useParts';
import { isLoggedIn, logout, getCurrentUser, fetchMe } from './api/auth';

// ── Error boundary — prevents pure black screen on runtime errors ──
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, fontFamily: 'monospace', color: '#ef4444', background: '#0a0a0a', minHeight: '100vh' }}>
        <div style={{ fontSize: 18, marginBottom: 12 }}>⚠ Runtime Error</div>
        <pre style={{ fontSize: 12, color: '#f87171', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
        <button onClick={() => this.setState({ error: null })} style={{ marginTop: 20, padding: '8px 16px', background: '#1a1a1a', border: '1px solid #333', color: '#ccc', cursor: 'pointer', borderRadius: 4 }}>
          Try Again
        </button>
      </div>
    );
    return this.props.children;
  }
}

function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;
  return <AuthedApp onLogout={() => { logout(); setAuthed(false); }} />;
}

function AuthedApp({ onLogout }) {
  const [activePage, setActivePage] = useState('parts');
  const { parts, loading, error, refetch } = useParts();
  const [user, setUser] = useState(getCurrentUser());
  const [modalOpen,       setModalOpen]       = useState(false);
  const [modalTab,        setModalTab]        = useState('single');
  const [weldingOpen,     setWeldingOpen]     = useState(false);
  const [settingsOpen,    setSettingsOpen]    = useState(false);

  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  function openModal(tab) { setModalTab(tab); setModalOpen(true); }

  return (
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        partCount={parts.length}
        onLogout={onLogout}
        onSettings={() => setSettingsOpen(true)}
        user={user}
      />
      <div className="main">
        <Topbar activePage={activePage} onOpenModal={openModal} onOpenWelding={() => setWeldingOpen(true)} />
        <div className="content">
          {activePage === 'parts' && (
            <>
              {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 12, padding: '8px 20px' }}>⚠ {error}</div>}
              {loading && !parts.length && <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>Loading parts...</div>}
              {(parts.length > 0 || !loading) && <PartsTable parts={parts} onPartsChange={refetch} onOpenModal={openModal} />}
            </>
          )}
          {activePage === 'gantt'     && <GanttChart parts={parts} loading={loading} onPartsChange={refetch} />}
          {activePage === 'lists'     && <ListEditor />}
          {activePage === 'reports'   && <CostingReport />}
          {activePage === 'dashboard' && <Dashboard parts={parts} loading={loading} />}
          {activePage === 'resources' && <ResourceView />}
          {activePage === 'process'   && <ProcessTracking />}
          {!['parts','dashboard','lists','gantt','resources','process','reports'].includes(activePage) && (
            <div className="page">
              <div className="section-title" style={{ textTransform: 'capitalize' }}>{activePage.replace('-',' ')}</div>
              <div className="section-sub" style={{ marginTop: 8 }}>Coming soon</div>
            </div>
          )}
        </div>
      </div>
      <NewPartModal open={modalOpen} initialTab={modalTab} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); refetch(); }} />
      <NewWeldingModal open={weldingOpen} onClose={() => setWeldingOpen(false)} onSuccess={() => { refetch(); }} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function AppRoot() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

export default AppRoot;

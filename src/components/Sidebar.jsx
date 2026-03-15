function Sidebar({ activePage, onNavigate, partCount, onLogout, onSettings, user }) {
  const displayName = user?.name || 'User';
  const displayRole = user?.role || 'operator';
  // Initials from name
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const mainNav = [
    { id: 'dashboard',  ico: '▦', label: 'Dashboard' },
    { id: 'parts',      ico: '⬡', label: 'Parts',           badge: partCount, badgeClass: '' },
    { id: 'process',    ico: '⟳', label: 'Process Tracking', badge: 3,         badgeClass: 'b' },
    { id: 'gantt',      ico: '▬', label: 'Gantt Chart' },
    { id: 'resources',  ico: '◉', label: 'Resource View',   badge: 'NEW',     badgeClass: 'g' },
  ];
  const adminNav = [
    { id: 'projects', ico: '◫', label: 'Projects' },
    { id: 'lists',    ico: '✎', label: 'List Editor' },
    { id: 'reports',  ico: '₹', label: 'Costing Reports' },
    { id: 'audit',    ico: '≡', label: 'Audit Trail' },
    { id: 'users',    ico: '◑', label: 'Users' },
  ];

  return (
    <aside className="sidebar">
      <div className="logo">
        <img
          src="data:image/png;base64,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"
          alt="Intralog"
          style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'contain', background: '#fff', flexShrink: 0 }}
        />
        <div>
          <div className="logo-text">INTRALOG</div>
          <div className="logo-sub">Factory Management</div>
        </div>
      </div>

      <nav className="nav-section">
        <div className="nav-label">Main</div>
        {mainNav.map(item => (
          <div
            key={item.id}
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="ico">{item.ico}</span>
            {item.label}
            {item.badge !== undefined && (
              <span className={`nbadge${item.badgeClass ? ' ' + item.badgeClass : ''}`}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </nav>

      <nav className="nav-section">
        <div className="nav-label">Admin</div>
        {adminNav
          .filter(item => item.id !== 'reports' || displayRole === 'admin')
          .map(item => (
          <div
            key={item.id}
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="ico">{item.ico}</span>
            {item.label}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div>
            <div className="uname">{displayName}</div>
            <div className="urole" style={{ textTransform: 'capitalize' }}>{displayRole}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            onClick={onSettings}
            style={{
              flex: 1, background: 'transparent',
              border: '1px solid var(--border2)', borderRadius: 3,
              color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10,
              padding: '6px 0', cursor: 'pointer', letterSpacing: '.08em',
              textTransform: 'uppercase', transition: 'color .15s, border-color .15s',
            }}
            onMouseEnter={e => { e.target.style.color = 'var(--accent)'; e.target.style.borderColor = 'rgba(255,140,0,.4)'; }}
            onMouseLeave={e => { e.target.style.color = 'var(--muted)'; e.target.style.borderColor = 'var(--border2)'; }}
          >
            ⚙ Settings
          </button>
          <button
            onClick={onLogout}
            style={{
              flex: 1, background: 'transparent',
              border: '1px solid var(--border2)', borderRadius: 3,
              color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 10,
              padding: '6px 0', cursor: 'pointer', letterSpacing: '.08em',
              textTransform: 'uppercase', transition: 'color .15s, border-color .15s',
            }}
            onMouseEnter={e => { e.target.style.color = 'var(--red)'; e.target.style.borderColor = 'rgba(239,68,68,.4)'; }}
            onMouseLeave={e => { e.target.style.color = 'var(--muted)'; e.target.style.borderColor = 'var(--border2)'; }}
          >
            ⎋ Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

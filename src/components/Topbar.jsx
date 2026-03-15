const PAGE_TITLES = {
  dashboard: 'Dashboard',
  parts:     'Parts Management',
  process:   'Process Tracking',
  gantt:     'Gantt Chart',
  resources: 'Resource View',
  projects:  'Projects',
  lists:     'List Editor',
  audit:     'Audit Trail',
  users:     'Users',
};

function Topbar({ activePage, onOpenModal, onOpenWelding }) {
  const title = PAGE_TITLES[activePage] || activePage;

  return (
    <div className="topbar">
      <div className="breadcrumb">
        INTRALOG / <span>{title}</span>
      </div>
      <div className="topbar-right">
        <button className="btn btn-ghost btn-sm" onClick={() => onOpenModal('bulk')}>
          ⊞ Bulk Create
        </button>
        <button
          className="btn btn-sm"
          onClick={onOpenWelding}
          style={{
            background: 'rgba(249,115,22,.12)',
            color: '#f97316',
            border: '1px solid rgba(249,115,22,.4)',
          }}
        >
          ⚙ Welding Part
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => onOpenModal('single')}>
          + New Part
        </button>
      </div>
    </div>
  );
}

export default Topbar;

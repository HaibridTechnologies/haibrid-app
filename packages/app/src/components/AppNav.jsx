const TABS = [
  { key: 'links',    label: 'Reading List' },
  { key: 'projects', label: 'Projects' },
  { key: 'content',  label: 'Content' },
  { key: 'tracking', label: 'Tracking' },
]

export default function AppNav({ activeTab, setActiveTab, activeProject, onBackToProjects, onImport, onEnterSelect }) {
  const showActions = activeTab === 'links' || (activeTab === 'projects' && activeProject)

  return (
    <nav className="app-nav">
      <img src="/haibrid-logo.png" alt="Haibrid" className="app-nav-logo" />

      <div className="app-nav-tabs">
        {activeProject ? (
          <>
            <button className="app-tab active" onClick={onBackToProjects}>
              ← Projects
            </button>
            <span className="app-nav-divider">/</span>
            <span
              className="app-project-crumb"
              style={{ borderBottomColor: activeProject.color, color: activeProject.color }}
            >
              {activeProject.name}
            </span>
          </>
        ) : (
          TABS.map(({ key, label }) => (
            <button
              key={key}
              className={`app-tab${activeTab === key ? ' active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))
        )}
      </div>

      {showActions && (
        <div className="app-nav-actions">
          <button className="btn-ghost btn-sm" onClick={onImport} title="Import links from a JSON file">
            Import
          </button>
          <button className="btn-ghost btn-sm" onClick={onEnterSelect} title="Select links to export">
            Export
          </button>
        </div>
      )}
    </nav>
  )
}

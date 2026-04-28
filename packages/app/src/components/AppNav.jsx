const TABS = [
  { key: 'links',    label: 'Reading List' },
  { key: 'projects', label: 'Projects' },
  { key: 'content',  label: 'Content' },
  { key: 'tasks',    label: 'Tasks' },
  { key: 'tracking', label: 'Tracking' },
]

export default function AppNav({ activeTab, setActiveTab, activeProject, onBackToProjects }) {
  return (
    <nav className="app-nav">
      <img src="/haibrid-logo.png" alt="Haibrid" className="app-nav-logo" />

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
    </nav>
  )
}

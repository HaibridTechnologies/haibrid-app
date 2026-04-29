import { useState, useEffect } from 'react'
import { useProjects } from '../../hooks/useProjects'
import ProjectCard from './ProjectCard'

const UNASSIGNED_PROJECT = { id: 'unassigned', name: 'Unassigned', color: 'var(--muted-light)' }

/** Preset palette for the new-project colour picker. */
const COLORS = [
  '#2563eb', '#7c3aed', '#059669', '#d97706',
  '#dc2626', '#0891b2', '#db2777', '#64748b',
]

/**
 * The projects grid page.
 *
 * Renders a special "Unassigned" card (hard-coded, not in the database) plus
 * one `<ProjectCard>` for each real project.  The Unassigned card shows a
 * count fetched directly at mount — it doesn't need to stay live because
 * the user will navigate away to see the actual links.
 *
 * A "New Project" dialog is managed with local state rather than a separate
 * route to keep the interaction lightweight.
 *
 * @param {Function} onOpenProject - Called with a project object to navigate into it
 */
export default function ProjectsPage({ onOpenProject }) {
  const { projects, loading, add, update, remove } = useProjects()
  const [unassignedCount, setUnassignedCount] = useState(0)
  const [showCreate, setShowCreate]           = useState(false)

  // Fetch the unassigned link count once on mount for the special card
  useEffect(() => {
    fetch('/api/links?unassigned=true')
      .then(r => r.json())
      .then(links => setUnassignedCount(links.length))
      .catch(() => {})
  }, [])

  // ─── New project dialog state ────────────────────────────────────────────────
  const [newName,  setNewName]  = useState('')
  const [newDesc,  setNewDesc]  = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    await add({ name: newName.trim(), description: newDesc.trim(), color: newColor })
    setNewName('')
    setNewDesc('')
    setNewColor(COLORS[0])
    setShowCreate(false)
    setCreating(false)
  }

  /** Reset and close the dialog without saving. */
  const closeDialog = () => {
    setShowCreate(false)
    setNewName('')
    setNewDesc('')
    setNewColor(COLORS[0])
  }

  return (
    <>
      <div className="toolbar">
        <span className="list-count" style={{ padding: 0, flex: 1 }}>
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
        <button className="primary" onClick={() => setShowCreate(true)}>+ New Project</button>
      </div>

      <main>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <div className="projects-grid">
            {/* Static card for read links that haven't been assigned to any project */}
            <div
              className="project-card unassigned-card"
              onClick={() => onOpenProject(UNASSIGNED_PROJECT)}
            >
              <div className="project-card-accent" style={{ background: 'var(--muted-light)' }} />
              <div className="project-card-body">
                <div className="project-card-name">Unassigned</div>
                <div className="project-card-desc">Read links with no project</div>
                <div className="project-card-footer">
                  <span className="project-card-count">
                    {unassignedCount} link{unassignedCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>

            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={onOpenProject}
                onEdit={update}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── New Project dialog ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="dialog-overlay" onClick={closeDialog}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <span className="dialog-title">New Project</span>
              <button className="dialog-close" onClick={closeDialog}>×</button>
            </div>
            <div className="dialog-body">
              <label className="dialog-label">Name</label>
              <input
                type="text"
                placeholder="Project name"
                value={newName}
                autoFocus
                style={{ width: '100%' }}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <label className="dialog-label">Description (optional)</label>
              <input
                type="text"
                placeholder="Short description…"
                value={newDesc}
                style={{ width: '100%' }}
                onChange={e => setNewDesc(e.target.value)}
              />
              <label className="dialog-label">Color</label>
              <div className="color-swatches">
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`color-swatch${newColor === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn-ghost" onClick={closeDialog}>Cancel</button>
              <button
                className="primary"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

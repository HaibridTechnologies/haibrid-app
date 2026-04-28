import { useState } from 'react'

/**
 * A card in the projects grid.
 *
 * Supports three interactions, all handled internally to avoid cluttering
 * the parent with per-card state:
 *
 *   - **Click** — opens the project's link list via `onClick(project)`
 *   - **Rename** — inline name editing triggered by the ✎ button; saves
 *     on Enter or blur, cancels on Escape
 *   - **Delete** — two-step confirmation: first click shows '?', second
 *     click triggers `onDelete`.  `onMouseLeave` resets the confirm state
 *     so accidental hovers don't leave the card in a dangerous state.
 *
 * @param {Object}   project   - Project data (id, name, description, color, linkCount, createdAt)
 * @param {Function} onClick   - Called with the project object to navigate into it
 * @param {Function} onEdit    - Called with (id, { name }) to rename
 * @param {Function} onDelete  - Called with (id) to delete
 */
export default function ProjectCard({ project, onClick, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing]       = useState(false)
  const [editName, setEditName]     = useState(project.name)

  const handleEditStart = (e) => {
    e.stopPropagation()
    setEditName(project.name) // reset to current name in case of previous discard
    setEditing(true)
  }

  const handleEditSave = async (e) => {
    e?.stopPropagation()
    if (editName.trim() && editName.trim() !== project.name) {
      await onEdit(project.id, { name: editName.trim() })
    }
    setEditing(false)
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (confirming) {
      onDelete(project.id)
    } else {
      setConfirming(true) // first click arms the confirm state
    }
  }

  // Human-readable creation label without importing a full date library
  const daysAgo  = Math.floor((Date.now() - new Date(project.createdAt)) / 86400000)
  const dateLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`

  return (
    <div
      className="project-card"
      onClick={() => !editing && onClick(project)} // don't navigate while renaming
      onMouseLeave={() => setConfirming(false)}    // disarm delete on mouse leave
    >
      {/* Colour accent strip on the left edge */}
      <div className="project-card-accent" style={{ background: project.color }} />
      <div className="project-card-body">
        {editing ? (
          <input
            className="project-card-name-input"
            value={editName}
            autoFocus
            onChange={e => setEditName(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleEditSave(e)
              if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) }
            }}
            onBlur={handleEditSave}
          />
        ) : (
          <div className="project-card-name">{project.name}</div>
        )}
        {project.description && (
          <div className="project-card-desc">{project.description}</div>
        )}
        <div className="project-card-footer">
          <span className="project-card-count">
            {project.linkCount} link{project.linkCount !== 1 ? 's' : ''}
          </span>
          <span className="project-card-date">{dateLabel}</span>
          <div className="project-card-actions" onClick={e => e.stopPropagation()}>
            <button className="project-action-btn" title="Rename" onClick={handleEditStart}>
              ✎
            </button>
            <button
              className={`project-action-btn${confirming ? ' danger' : ''}`}
              title={confirming ? 'Click again to confirm delete' : 'Delete'}
              onClick={handleDelete}
            >
              {confirming ? '?' : '×'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

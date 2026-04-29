import { useState } from 'react'
import ProjectSelector from '../projects/ProjectSelector'

/**
 * Top-of-page controls for a link list view.
 *
 * Contains two rows:
 *   1. A search input (always shown).
 *   2. An add-link form — URL, optional notes, project picker, and submit
 *      button — hidden when `readOnly` is true (e.g. the Unassigned folder).
 *
 * When rendered inside a project view, the project's ID is pre-selected in
 * the ProjectSelector and locked so it cannot be de-selected.
 *
 * @param {boolean}  isAdding        - Disables the Add button while a request is in flight
 * @param {Function} onAdd           - Called with (url, notes, selectedProjects[])
 * @param {Function} onSearchChange  - Called with the raw search string (debounced upstream)
 * @param {Object}   project         - Current project context (null in reading-list mode)
 * @param {boolean}  readOnly        - Hides the add form when true
 */
const READ_FILTERS = [
  { value: 'unread', label: 'Unread' },
  { value: 'all',    label: 'All' },
  { value: 'read',   label: 'Read' },
]

export default function LinkToolbar({ isAdding, onAdd, onSearchChange, project = null, readOnly = false, readFilter = null, onReadFilterChange }) {
  const [url, setUrl]                   = useState('')
  const [notes, setNotes]               = useState('')
  const [selectedProjects, setSelected] = useState(project ? [project.id] : [])

  const submit = async () => {
    if (!url.trim()) return
    await onAdd(url.trim(), notes.trim(), selectedProjects)
    setUrl('')
    setNotes('')
    if (!project) setSelected([]) // reset project selection only in reading-list mode
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="links-search"
          type="text"
          placeholder="Search…"
          autoComplete="off"
          onChange={e => onSearchChange(e.target.value)}
        />
        {readFilter !== null && (
          <div className="read-filter-tabs">
            {READ_FILTERS.map(f => (
              <button
                key={f.value}
                className={`read-filter-tab${readFilter === f.value ? ' active' : ''}`}
                onClick={() => onReadFilterChange(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="toolbar" style={{ borderTop: 'none' }}>
          <input
            type="url"
            placeholder="Paste a URL and press Enter…"
            autoComplete="off"
            style={{ flex: 1 }}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <input
            type="text"
            placeholder="Notes (optional)"
            autoComplete="off"
            style={{ width: 160 }}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          {/* lockedId prevents the user from deselecting the current project */}
          <ProjectSelector
            selected={selectedProjects}
            onChange={setSelected}
            lockedId={project?.id}
          />
          <button className="primary" onClick={submit} disabled={isAdding}>
            {isAdding ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
    </>
  )
}

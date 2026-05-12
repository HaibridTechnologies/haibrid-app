import { useState, useRef, useEffect } from 'react'
import ProjectSelector from '../projects/ProjectSelector'

const READ_FILTERS = [
  { value: 'unread', label: 'Unread' },
  { value: 'all',    label: 'All'    },
  { value: 'read',   label: 'Read'   },
]

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'dwell',  label: 'Most visited'   },
]

/**
 * Top-of-page controls for a link list view.
 *
 * The add-link form is hidden behind a "+ Add link" button and expands
 * inline when clicked. Pressing Escape or submitting collapses it again.
 *
 * @param {boolean}  isAdding        - Disables the Add button while a request is in flight
 * @param {Function} onAdd           - Called with (url, notes, selectedProjects[])
 * @param {Function} onSearchChange  - Called with the raw search string (debounced upstream)
 * @param {Object}   project         - Current project context (null in reading-list mode)
 * @param {boolean}  readOnly        - Hides the add form when true
 */
export default function LinkToolbar({
  isAdding, onAdd, onSearchChange,
  project = null, readOnly = false,
  readFilter = null, onReadFilterChange,
  onImport, onEnterSelect,
  sortBy = 'recent', onSortChange,
}) {
  const [open,             setOpen]    = useState(false)
  const [url,              setUrl]     = useState('')
  const [notes,            setNotes]   = useState('')
  const [selectedProjects, setSelected] = useState(project ? [project.id] : [])
  const urlInputRef = useRef(null)

  // Focus the URL input whenever the form opens
  useEffect(() => {
    if (open) urlInputRef.current?.focus()
  }, [open])

  const openForm  = () => setOpen(true)
  const closeForm = () => {
    setOpen(false)
    setUrl('')
    setNotes('')
    if (!project) setSelected([])
  }

  const submit = async () => {
    if (!url.trim()) return
    await onAdd(url.trim(), notes.trim(), selectedProjects)
    closeForm()
  }

  return (
    <>
      {/* ── Primary toolbar: search + filters + actions ── */}
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

        {onSortChange && (
          <div className="sort-tabs">
            {SORT_OPTIONS.map(s => (
              <button
                key={s.value}
                className={`sort-tab${sortBy === s.value ? ' active' : ''}`}
                onClick={() => onSortChange(s.value)}
                title={s.value === 'dwell' ? 'Sort by time spent on page' : 'Sort by date added'}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {project && project.id !== 'unassigned' && (
          <>
            <button className="btn-ghost btn-sm" onClick={onImport} title="Import links">Import</button>
            <button className="btn-ghost btn-sm" onClick={onEnterSelect} title="Select links to export">Export</button>
          </>
        )}

        {/* "+ Add link" trigger — right-aligned, only when not readOnly */}
        {!readOnly && (
          <button
            className={`add-link-trigger${open ? ' active' : ''}`}
            onClick={open ? closeForm : openForm}
            title="Add a new link"
          >
            <span className="add-link-trigger-icon">{open ? '×' : '+'}</span>
            {open ? 'Cancel' : 'Add link'}
          </button>
        )}
      </div>

      {/* ── Expandable add-link form ── */}
      {!readOnly && open && (
        <div className="add-link-form">
          <input
            ref={urlInputRef}
            type="url"
            className="add-link-url"
            placeholder="Paste a URL…"
            autoComplete="off"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  submit()
              if (e.key === 'Escape') closeForm()
            }}
          />
          <input
            type="text"
            className="add-link-notes"
            placeholder="Notes (optional)"
            autoComplete="off"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  submit()
              if (e.key === 'Escape') closeForm()
            }}
          />
          <ProjectSelector
            selected={selectedProjects}
            onChange={setSelected}
            lockedId={project?.id}
          />
          <button className="primary btn-sm" onClick={submit} disabled={isAdding || !url.trim()}>
            {isAdding ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
    </>
  )
}

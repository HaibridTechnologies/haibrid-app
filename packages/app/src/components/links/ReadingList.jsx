import { useState, useEffect, useRef } from 'react'
import { useLinks } from '../../hooks/useLinks'
import { useSnackbar } from '../../hooks/useSnackbar'
import { getProjects } from '../../api/projectsApi'
import { exportSelectedLinks, importLinks } from '../../api/linksApi'
import LinkToolbar from './LinkToolbar'
import LinkItem from './LinkItem'
import LinkModal from './LinkModal'
import Snackbar from '../Snackbar'

/**
 * The main link list view — used for three distinct modes:
 *
 *   - Reading List  (project = null)       — shows all unread links
 *   - Project view  (project.id = real id) — shows links tagged with that project
 *   - Unassigned    (project.id = 'unassigned') — shows read links with no project
 *
 * Mutations (toggle, delete) are optimistic: the list updates immediately
 * and a `<Snackbar>` with an Undo button appears for 5 seconds.  Clicking
 * Undo reverses the action on both the server and local state.
 *
 * Clicking a link row opens `<LinkModal>` showing full details and page content.
 *
 * @param {Object|null} project - Project context; null for the reading list
 */
export default function ReadingList({ project = null, actionsRef = null }) {
  // Derive the mode from the project prop so useLinks fetches the right subset
  const mode = project
    ? (project.id === 'unassigned' ? 'unassigned' : 'project')
    : 'reading-list'

  const [readFilter, setReadFilter] = useState('unread')

  const { links, isAdding, add, toggle, remove, updateProjects, updateTitle, handleSearchChange, reload } = useLinks({
    projectId: project?.id !== 'unassigned' ? project?.id : null,
    mode,
    readFilter,
  })

  const { snackbar, show: showSnackbar, dismiss } = useSnackbar()
  const [viewingLink, setViewingLink]   = useState(null)
  const [allProjects, setAllProjects]   = useState([])
  const [selectMode, setSelectMode]     = useState(false)
  const [selectedIds, setSelectedIds]   = useState(new Set())
  const importInputRef = useRef(null)

  const enterSelect  = () => { setSelectMode(true); setSelectedIds(new Set()) }
  const exitSelect   = () => { setSelectMode(false); setSelectedIds(new Set()) }

  const toggleSelect = (id) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectAll = () =>
    setSelectedIds(selectedIds.size === links.length ? new Set() : new Set(links.map(l => l.id)))

  const handleExportSelected = () => {
    const chosen = links.filter(l => selectedIds.has(l.id))
    exportSelectedLinks(chosen)
    exitSelect()
  }

  // Fetch project list once so the tag editor can show names/colours
  useEffect(() => {
    getProjects().then(setAllProjects).catch(() => {})
  }, [])

  // Register import/select triggers so AppNav can invoke them
  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = {
        triggerImport: () => importInputRef.current?.click(),
        enterSelect,
      }
    }
  })

  const isUnassigned = project?.id === 'unassigned'

  // Contextual empty-state message for each view mode
  const emptyMessage = isUnassigned
    ? 'No read links without a project.'
    : project
    ? `No links in "${project.name}" yet — paste a URL above.`
    : 'No unread links — nice work!'

  const handleToggle = (link) => {
    const undo = toggle(link)
    showSnackbar({
      message:     `"${link.title || link.url}" marked as ${link.read ? 'unread' : 'read'}`,
      actionLabel: 'Undo',
      onAction:    undo,
    })
  }

  const handleDelete = (link) => {
    const undo = remove(link)
    showSnackbar({
      message:     `"${link.title || link.url}" removed`,
      actionLabel: 'Undo',
      onAction:    undo,
    })
  }

  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const payload = Array.isArray(data) ? { links: data } : data
      const { added, skipped } = await importLinks(payload)
      showSnackbar({ message: `Imported ${added} link${added !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped — already saved)` : ''}` })
      reload()
    } catch {
      showSnackbar({ message: 'Import failed — invalid file' })
    }
  }

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
      <LinkToolbar
        isAdding={isAdding}
        onAdd={add}
        onSearchChange={handleSearchChange}
        project={isUnassigned ? null : project}
        readOnly={isUnassigned}
        readFilter={mode === 'reading-list' ? readFilter : null}
        onReadFilterChange={setReadFilter}
      />
      <main>
        <div className="list-count">
          {links.length} link{links.length !== 1 ? 's' : ''}
        </div>
        <div className="card">
          {links.length === 0 ? (
            <div className="empty">{emptyMessage}</div>
          ) : (
            links.map(link => (
              <LinkItem
                key={link.id}
                link={link}
                allProjects={allProjects}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onDetails={selectMode ? null : setViewingLink}
                onTagsChange={updateProjects}
                onTitleChange={updateTitle}
                selectMode={selectMode}
                selected={selectedIds.has(link.id)}
                onSelect={toggleSelect}
              />
            ))
          )}
        </div>
      </main>

      {/* Link detail modal */}
      {viewingLink && (
        <LinkModal
          link={viewingLink}
          onClose={() => setViewingLink(null)}
          onLinkUpdated={(updated) => {
            // Keep the reading list in sync when content status changes inside the modal
            setViewingLink(updated)
          }}
        />
      )}

      {/* Sticky selection bar */}
      {selectMode && (
        <div className="selection-bar">
          <span className="selection-count">
            {selectedIds.size} selected
          </span>
          <button className="btn-ghost btn-sm" onClick={selectAll}>
            {selectedIds.size === links.length ? 'Deselect all' : 'Select all'}
          </button>
          <button
            className="primary btn-sm"
            disabled={selectedIds.size === 0}
            onClick={handleExportSelected}
          >
            Export selected
          </button>
          <button className="btn-ghost btn-sm" onClick={exitSelect}>
            Cancel
          </button>
        </div>
      )}

      {/* key={snackbar.key} forces re-mount when a new snackbar replaces an old one */}
      {snackbar && (
        <Snackbar
          key={snackbar.key}
          message={snackbar.message}
          actionLabel={snackbar.actionLabel}
          onAction={snackbar.onAction}
          onDismiss={dismiss}
        />
      )}
    </>
  )
}

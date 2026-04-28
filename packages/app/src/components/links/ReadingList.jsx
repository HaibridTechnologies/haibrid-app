import { useState, useEffect } from 'react'
import { useLinks } from '../../hooks/useLinks'
import { useSnackbar } from '../../hooks/useSnackbar'
import { getProjects } from '../../api/projectsApi'
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
export default function ReadingList({ project = null }) {
  // Derive the mode from the project prop so useLinks fetches the right subset
  const mode = project
    ? (project.id === 'unassigned' ? 'unassigned' : 'project')
    : 'reading-list'

  const { links, isAdding, add, toggle, remove, updateProjects, updateTitle, handleSearchChange } = useLinks({
    projectId: project?.id !== 'unassigned' ? project?.id : null,
    mode,
  })

  const { snackbar, show: showSnackbar, dismiss } = useSnackbar()
  const [viewingLink, setViewingLink] = useState(null)   // link shown in LinkModal
  const [allProjects, setAllProjects] = useState([])

  // Fetch project list once so the tag editor can show names/colours
  useEffect(() => {
    getProjects().then(setAllProjects).catch(() => {})
  }, [])

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

  return (
    <>
      <LinkToolbar
        isAdding={isAdding}
        onAdd={add}
        onSearchChange={handleSearchChange}
        project={isUnassigned ? null : project}
        readOnly={isUnassigned}
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
                onDetails={setViewingLink}
                onTagsChange={updateProjects}
                onTitleChange={updateTitle}
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

import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/linksApi'

/**
 * Manage a filtered list of links for one of three views:
 *   - 'reading-list'  — unread links (default home view)
 *   - 'project'       — links belonging to a specific project
 *   - 'unassigned'    — read links with no project assigned
 *
 * All mutations (toggle, remove) are optimistic: local state updates
 * immediately, the API call fires in the background, and the list is
 * restored if the server rejects the change.  Each mutation also returns
 * an async `undo` function for the snackbar.
 *
 * @param {Object}  options
 * @param {string}  options.projectId  - Project to filter by (only in 'project' mode)
 * @param {string}  options.mode       - 'reading-list' | 'project' | 'unassigned'
 */
export function useLinks({ projectId = null, mode = 'reading-list' } = {}) {
  const [allLinks, setAllLinks] = useState([])   // full unfiltered set from server
  const [isAdding, setIsAdding] = useState(false)
  const [search, setSearch]     = useState('')

  /** Build the correct API call for the current view mode (no search — done client-side). */
  const fetchLinks = useCallback(() => {
    if (mode === 'unassigned') return api.getLinks('', null, { unassigned: true })
    if (mode === 'project')    return api.getLinks('', projectId)
    return api.getLinks('', null, { unread: true })
  }, [mode, projectId])

  /** Load (or reload) the full link set from the server. */
  const load = useCallback(async () => {
    const data = await fetchLinks()
    setAllLinks(data)
  }, [fetchLinks])

  // Initial fetch whenever mode or projectId changes
  useEffect(() => { load() }, [load])

  /** Client-side filter — instant, no round-trip needed. */
  const links = search
    ? allLinks.filter(l => {
        const q = search.toLowerCase()
        return (
          l.url.toLowerCase().includes(q) ||
          (l.title && l.title.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q))
        )
      })
    : allLinks

  const handleSearchChange = useCallback((value) => {
    setSearch(value)
  }, [])

  /** Add a new link, ensuring the current project is always included. */
  const add = useCallback(async (url, notes, selectedProjects = []) => {
    if (!url) return
    setIsAdding(true)
    // Prepend the current project so links added inside a project view are tagged
    const projects = (projectId && !selectedProjects.includes(projectId))
      ? [projectId, ...selectedProjects]
      : selectedProjects
    await api.addLink(url, notes, projects)
    await load()
    setIsAdding(false)
  }, [load, projectId])

  /**
   * Toggle a link's read/unread state.
   * Optimistically removes the link from the current view (since toggling
   * typically moves it out of the reading list), fires the API call, and
   * restores the item if the server rejects.
   *
   * @param   {Object}   link - Full link object from state
   * @returns {Function} undo - Async function; reverts and syncs from server
   */
  const toggle = useCallback((link) => {
    setAllLinks(prev => prev.filter(l => l.id !== link.id)) // optimistic remove

    // Commit on the server; restore locally on failure
    api.toggleLink(link.id).catch(() => {
      setAllLinks(prev => [link, ...prev])
    })

    // Undo: toggle back on server then sync local state from server
    const undo = async () => {
      setAllLinks(prev => [link, ...prev])
      await api.toggleLink(link.id)
      await load()
    }

    return undo
  }, [load])

  /**
   * Permanently delete a link.
   * Optimistically removes from the list; undo re-creates the link via the API.
   *
   * @param   {Object}   link - Full link object from state
   * @returns {Function} undo - Async function; re-creates and syncs from server
   */
  const remove = useCallback((link) => {
    setAllLinks(prev => prev.filter(l => l.id !== link.id)) // optimistic remove

    // Commit delete on the server; restore locally on failure
    api.deleteLink(link.id).catch(() => {
      setAllLinks(prev => [link, ...prev])
    })

    // Undo: re-create the link on server (new ID) then sync local state
    const undo = async () => {
      setAllLinks(prev => [link, ...prev])
      await api.addLinkFull(link)
      await load()
    }

    return undo
  }, [load])

  /**
   * Update the project tags for a single link.
   * Optimistically updates the link in-place so chips reflect changes immediately.
   *
   * @param {Object}   link     - Full link object from state
   * @param {string[]} projects - New array of project IDs
   */
  const updateProjects = useCallback((link, projects) => {
    setAllLinks(prev => prev.map(l => l.id === link.id ? { ...l, projects } : l))
    api.updateLinkProjects(link.id, projects).catch(() => {
      setAllLinks(prev => prev.map(l => l.id === link.id ? link : l))
    })
  }, [])

  /** Update a link's title in local state after a successful rename. */
  const updateTitle = useCallback((updated) => {
    setAllLinks(prev => prev.map(l => l.id === updated.id ? { ...l, title: updated.title } : l))
  }, [])

  return { links, isAdding, add, toggle, remove, updateProjects, updateTitle, handleSearchChange }
}

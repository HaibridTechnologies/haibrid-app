/**
 * Thin wrapper around the Express `/api/links` routes.
 * Throws on any non-OK HTTP response so callers can `.catch()` errors uniformly.
 */

async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} → ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

/**
 * Fetch links, optionally filtered and/or searched.
 *
 * @param {string}  search     - Full-text search string (matches url, title, notes)
 * @param {string}  projectId  - Restrict to links belonging to this project
 * @param {Object}  flags
 * @param {boolean} flags.unread      - Only unread links (Reading List)
 * @param {boolean} flags.unassigned  - Only read links with no project (Unassigned folder)
 */
export const getLinks = (search, projectId, { unread = false, unassigned = false } = {}) => {
  const params = new URLSearchParams()
  if (search)     params.set('q',          search)
  if (projectId)  params.set('project',    projectId)
  if (unread)     params.set('unread',     'true')
  if (unassigned) params.set('unassigned', 'true')
  const qs = params.toString()
  return request(`/api/links${qs ? `?${qs}` : ''}`)
}

/** Create a new link, optionally associating it with one or more projects. */
export const addLink = (url, notes, projects = []) =>
  request('/api/links', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, notes, projects }),
  })

/** Fetch a single link by ID. Used by LinkModal for status polling. */
export const getLink = (id) => request(`/api/links/${id}`)

/** Re-fetch citation count from Semantic Scholar for an arXiv link. */
export const refreshCitations = (id) =>
  request(`/api/links/${id}/citations/refresh`, { method: 'POST' })

/** Flip the read/unread flag for a link. */
export const toggleLink = (id) =>
  request(`/api/links/${id}/toggle`, { method: 'PATCH' })

/** Update the title of a link. */
export const updateLinkTitle = (id, title) =>
  request(`/api/links/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ title }),
  })

/** Permanently delete a link. */
export const deleteLink = (id) =>
  request(`/api/links/${id}`, { method: 'DELETE' })

/** Trigger a browser download of a specific set of links as a JSON file. */
export const exportSelectedLinks = (links) => {
  const data = { version: 1, exportedAt: new Date().toISOString(), links }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `haibrid-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Import links from a parsed export object. Returns { added, skipped }. */
export const importLinks = (data) =>
  request('/api/links/import', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  })

/** Replace the full project list for a link and sync the inverted index. */
export const updateLinkProjects = (id, projects) =>
  request(`/api/links/${id}/projects`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ projects }),
  })

/**
 * Re-create a previously deleted link from its full object snapshot.
 * Used by the undo-delete flow — the server will assign a new ID and
 * fetch a fresh title if the original is missing, but URL/notes/projects
 * are preserved exactly.
 */
export const addLinkFull = (link) =>
  request('/api/links', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url:      link.url,
      title:    link.title,
      notes:    link.notes,
      projects: link.projects || [],
    }),
  })

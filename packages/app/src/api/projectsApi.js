/**
 * Thin wrapper around the Express `/api/projects` routes.
 * Throws on any non-OK HTTP response so callers can `.catch()` errors uniformly.
 */

async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} → ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

/**
 * Fetch all projects.
 * Each project includes a computed `linkCount` derived from the inverted index.
 */
export const getProjects = () => request('/api/projects')

/** Create a new project and return it with linkCount = 0. */
export const createProject = ({ name, description, color }) =>
  request('/api/projects', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, description, color }),
  })

/** Partially update a project — only supplied fields are changed. */
export const updateProject = (id, updates) =>
  request(`/api/projects/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(updates),
  })

/**
 * Delete a project and cascade: removes the project from the inverted index
 * and from every link's `projects` array (server-side).
 */
export const deleteProject = (id) =>
  request(`/api/projects/${id}`, { method: 'DELETE' })

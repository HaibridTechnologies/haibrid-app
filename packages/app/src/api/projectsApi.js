/**
 * Thin wrapper around the Express `/api/projects` routes.
 */

import { request } from './request'

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

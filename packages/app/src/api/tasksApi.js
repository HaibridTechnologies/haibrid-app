/**
 * Thin wrapper around the Express `/api/tasks` routes.
 * Throws on any non-OK HTTP response so callers can `.catch()` errors uniformly.
 */

async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} → ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

/** Fetch all tasks (unsorted — ordering is handled by the client). */
export const getTasks = () => request('/api/tasks')

/** Create a new task from a plain-text string. */
export const addTask = (text) =>
  request('/api/tasks', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text }),
  })

/**
 * Partially update a task.
 * Commonly used fields in `data`:
 *   - `text`       {string}       rename the task
 *   - `important`  {number|null}  score in [-1, 1] for the matrix y-axis
 *   - `urgent`     {number|null}  score in [-1, 1] for the matrix x-axis
 *   - `dueDate`    {string|null}  ISO date string
 *   - `completed`  {boolean}      stamps / clears completedAt server-side
 */
export const updateTask = (id, data) =>
  request(`/api/tasks/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  })

/** Permanently delete a task. */
export const deleteTask = (id) =>
  request(`/api/tasks/${id}`, { method: 'DELETE' })

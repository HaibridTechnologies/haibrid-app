async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} → ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

/** Fetch visit history. days defaults to 30. */
export const getVisits = ({ days = 30, domain, q } = {}) => {
  const params = new URLSearchParams({ days })
  if (domain) params.set('domain', domain)
  if (q)      params.set('q', q)
  return request(`/api/visits?${params}`)
}

/** Clear all visit history. */
export const clearVisits = () =>
  request('/api/visits', { method: 'DELETE' })

/** Delete a single visit by id. */
export const deleteVisit = (id) =>
  request(`/api/visits/${id}`, { method: 'DELETE' })

/** Fetch server-side config defaults (minDwellSeconds etc). */
export const getConfig = () => request('/api/config')

/** Fetch the current filter config. */
export const getFilters = () => request('/api/visits/filters')

/** Replace the full filter config. */
export const saveFilters = (filters) =>
  request('/api/visits/filters', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(filters),
  })

/** Fetch the pending evaluation queue. */
export const getPendingVisits = () => request('/api/visits/pending')

/** Trigger LLM evaluation of the pending queue. */
export const evaluatePending = () =>
  request('/api/visits/pending/evaluate', { method: 'POST' })

/** Discard the entire pending queue without evaluating. */
export const discardPending = () =>
  request('/api/visits/pending', { method: 'DELETE' })

/**
 * Save feedback for one or more evaluated visits.
 * @param {Array<{url, comment, decision, reason}>} items
 */
export const saveFeedback = (items) =>
  request('/api/feedback', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(items),
  })

/** Fetch all feedback entries for a URL. */
export const getFeedback = (url) =>
  request(`/api/feedback?url=${encodeURIComponent(url)}`)

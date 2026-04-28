/**
 * API helpers for the saved-content feature.
 * All routes are nested under `/api/links/:id/content`.
 */

const BASE = '/api/links';

/** Fetch all links that have a content record (any status other than null/none). */
export const getContentLinks = () =>
  fetch(`${BASE}?hasContent=true`).then(r => r.json());

/**
 * Trigger content saving for a link.
 *
 * If `text` is supplied (extracted by the extension from the live DOM), the
 * server persists it directly and marks the link as parsed immediately.
 *
 * If `text` is omitted, the server fetches and parses the page itself — the
 * link is marked 'pending' until the background queue completes.
 *
 * @param {string}      linkId
 * @param {string|null} text   - Pre-extracted plain text from the extension
 */
export const saveContent = (linkId, text = null) =>
  fetch(`${BASE}/${linkId}/content`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(text ? { text } : {}),
  }).then(r => r.json());

/** Fetch the raw saved plain-text and truncation flag for a link. */
export const getContent = (linkId) =>
  fetch(`${BASE}/${linkId}/content`).then(r => r.json());

/** Remove saved content for a link and reset all content-related fields. */
export const deleteContent = (linkId) =>
  fetch(`${BASE}/${linkId}/content`, { method: 'DELETE' });

/** Poll the server-side content queue for debugging / status display. */
export const getQueueStatus = () =>
  fetch('/api/content/queue').then(r => r.json());

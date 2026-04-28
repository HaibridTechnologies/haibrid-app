'use strict';

/**
 * Semantic Scholar API helpers.
 * Free, no API key required for basic queries.
 * Rate limit: 100 requests / 5 min unauthenticated.
 */

const API = 'https://api.semanticscholar.org/graph/v1/paper';

/**
 * Extract an arXiv paper ID from any arxiv URL variant.
 *   https://arxiv.org/abs/1706.03762
 *   https://arxiv.org/pdf/1706.03762
 *   https://arxiv.org/pdf/1706.03762v2.pdf
 *   https://arxiv.org/abs/1706.03762v3
 *
 * Returns the bare ID (e.g. "1706.03762"), or null if the URL is not arxiv.
 */
function extractArxivId(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.endsWith('arxiv.org')) return null;
    // pathname is like /abs/1706.03762v2 or /pdf/1706.03762v2.pdf
    const match = pathname.match(/\/(abs|pdf|html)\/([0-9]{4}\.[0-9]+)/);
    if (!match) return null;
    return match[2]; // bare ID, no version suffix
  } catch {
    return null;
  }
}

/**
 * Fetch the citation count for a paper identified by its arXiv ID.
 *
 * @param {string} arxivId  e.g. "1706.03762"
 * @returns {Promise<number|null>}  citation count, or null on failure
 */
async function fetchCitationCount(arxivId) {
  const url = `${API}/arXiv:${arxivId}?fields=citationCount`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Haibrid-links-app/1.0' },
    signal:  AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data.citationCount === 'number' ? data.citationCount : null;
}

module.exports = { extractArxivId, fetchCitationCount };

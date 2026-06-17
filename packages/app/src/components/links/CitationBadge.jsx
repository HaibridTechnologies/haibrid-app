import { useState, useEffect } from 'react'
import { refreshCitations } from '../../api/linksApi'

/**
 * Citation count badge for arXiv links.
 * Shows the count with a hover tooltip that lets the user refresh it.
 *
 * @param {Object}   link           - Link object (must have id, citationCount, citationCountAt)
 * @param {Function} onLinkUpdated  - Called with the updated link after a refresh
 */
export default function CitationBadge({ link, onLinkUpdated }) {
  const [refreshing, setRefreshing] = useState(false)
  const [tooltip,    setTooltip]    = useState(false)

  // Auto-fetch on first open if no count stored yet
  useEffect(() => {
    if (link.citationCount != null) return
    refreshCitations(link.id)
      .then(updated => onLinkUpdated?.(updated))
      .catch((err) => console.error('[CitationBadge] auto-fetch failed:', err))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const updated = await refreshCitations(link.id)
      onLinkUpdated?.(updated)
    } catch (err) {
      console.error('[CitationBadge] refresh failed:', err)
    }
    setRefreshing(false)
  }

  return (
    <div
      className="citation-count-wrap"
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      {link.citationCount != null ? (
        <span className="citation-count">
          {link.citationCount.toLocaleString()} citations
        </span>
      ) : (
        <span className="citation-count citation-count-loading">
          {refreshing ? 'Fetching citations…' : '— citations'}
        </span>
      )}
      {tooltip && link.citationCount != null && (
        <div className="citation-tooltip">
          <div className="citation-tooltip-date">
            Last updated{' '}
            {new Date(link.citationCountAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <button
            className="citation-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      )}
    </div>
  )
}

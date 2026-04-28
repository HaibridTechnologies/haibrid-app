import { useState, useEffect, useCallback, useRef } from 'react'
import { getContentLinks, saveContent, deleteContent } from '../../api/contentApi'
import { fmtDate } from '../../utils/date'
import ContentViewer from './ContentViewer'

/** Human-readable labels for each content status value. */
const STATUS_LABEL = {
  pending: 'Fetching…',
  parsed:  'Saved',
  failed:  'Failed',
}

/** CSS class names for each content status badge. */
const STATUS_CLASS = {
  pending: 'content-badge pending',
  parsed:  'content-badge parsed',
  failed:  'content-badge failed',
}

/**
 * List of all links that have a saved content record.
 *
 * Polling:
 *   When any link is in 'pending' state the page polls every 3 seconds so
 *   the UI updates automatically when the background queue finishes.  The
 *   interval is cleared as soon as no pending links remain.
 *
 * Local state pattern for async actions:
 *   `deleting` and `saving` are maps of `{ [id]: true }` so multiple rows
 *   can be in-flight simultaneously without blocking each other.
 */
export default function ContentPage() {
  const [links, setLinks]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [viewing, setViewing]   = useState(null) // link object shown in ContentViewer
  const [deleting, setDeleting] = useState({})   // { [id]: true } while delete is in flight
  const [saving, setSaving]     = useState({})   // { [id]: true } while retry is in flight
  const pollRef = useRef(null)                    // setInterval handle

  const load = useCallback(async () => {
    try {
      const data = await getContentLinks()
      setLinks(data)
    } catch (_) {}
    setLoading(false)
  }, [])

  // Initial load on mount
  useEffect(() => { load() }, [load])

  // Start / stop the poll based on whether any link is still pending
  useEffect(() => {
    const hasPending = links.some(l => l.contentStatus === 'pending')
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(load, 3000)
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    // Always clear on unmount to avoid updates on a dead component
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [links, load])

  /** Re-trigger a server-side fetch for a failed (or timed-out) link. */
  const handleRetry = async (link) => {
    setSaving(s => ({ ...s, [link.id]: true }))
    try {
      const updated = await saveContent(link.id)
      setLinks(ls => ls.map(l => l.id === link.id ? updated : l))
    } catch (_) {}
    setSaving(s => { const n = { ...s }; delete n[link.id]; return n })
  }

  /** Delete saved content for a link and remove it from the list. */
  const handleDelete = async (link) => {
    setDeleting(d => ({ ...d, [link.id]: true }))
    try {
      await deleteContent(link.id)
      setLinks(ls => ls.filter(l => l.id !== link.id))
    } catch (_) {
      // Restore the deleting flag so the button re-enables on failure
      setDeleting(d => { const n = { ...d }; delete n[link.id]; return n })
    }
  }

  // Client-side filter on title and URL (no server round-trip needed)
  const filtered = links.filter(l => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (l.title && l.title.toLowerCase().includes(q)) ||
      l.url.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="toolbar">
        <input
          type="text"
          className="links-search"
          placeholder="Search saved content…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <main>
        {loading && <p className="empty">Loading…</p>}

        {!loading && filtered.length === 0 && (
          <p className="empty">
            {links.length === 0
              ? 'No content saved yet. Use the extension to save a page\'s content.'
              : 'No matches.'}
          </p>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <p className="list-count">{filtered.length} saved {filtered.length === 1 ? 'page' : 'pages'}</p>
            <div className="card">
              {filtered.map(link => (
                <div key={link.id} className="content-row">
                  <div className="content-row-body">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="link-title"
                    >
                      {link.title || link.url}
                    </a>
                    <span className="link-url">{link.url}</span>
                    {link.contentStatus === 'failed' && link.contentError && (
                      <span className="content-row-error">{link.contentError}</span>
                    )}
                  </div>
                  <div className="content-row-meta">
                    <span className={STATUS_CLASS[link.contentStatus] || 'content-badge'}>
                      {STATUS_LABEL[link.contentStatus] || link.contentStatus}
                    </span>
                    {link.contentParsedAt && (
                      <span className="meta-date">{fmtDate(link.contentParsedAt)}</span>
                    )}
                    {link.contentStatus === 'parsed' && (
                      <button
                        className="content-action-btn"
                        onClick={() => setViewing(link)}
                        title="View content"
                      >
                        View
                      </button>
                    )}
                    {(link.contentStatus === 'failed' || link.contentStatus === 'pending') && (
                      <button
                        className="content-action-btn"
                        onClick={() => handleRetry(link)}
                        disabled={saving[link.id] || link.contentStatus === 'pending'}
                        title="Retry fetch"
                      >
                        {saving[link.id] ? '…' : 'Retry'}
                      </button>
                    )}
                    <button
                      className="content-action-btn danger"
                      onClick={() => handleDelete(link)}
                      disabled={deleting[link.id]}
                      title="Remove saved content"
                    >
                      {deleting[link.id] ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Modal overlay — rendered at the page root to avoid z-index issues */}
      {viewing && (
        <ContentViewer link={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

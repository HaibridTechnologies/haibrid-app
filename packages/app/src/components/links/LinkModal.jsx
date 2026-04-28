import { useState, useEffect, useRef } from 'react'
import { getLink, updateLinkTitle, refreshCitations } from '../../api/linksApi'
import { getContent, saveContent } from '../../api/contentApi'
import { getFeedback } from '../../api/visitsApi'
import { fmtDate } from '../../utils/date'

/**
 * Detail modal for a single link.
 *
 * Layout when a PDF is available:
 *   ┌─ header (title + close) ──────────────────────┐
 *   │  metadata strip (url, notes, date)             │
 *   │  tab bar  [ Content ]  [ PDF ]                 │
 *   ├───────────────────────────────────────────────┤
 *   │  Content tab: abstract → AI summary → text    │  ← scrollable
 *   │  PDF tab    : iframe fills remaining height   │  ← fixed
 *   └───────────────────────────────────────────────┘
 *
 * When no PDF exists the tab bar is hidden and only the content panel shows.
 *
 * @param {Object}   link           - Link object from the reading list
 * @param {Function} onClose        - Called when the modal should be dismissed
 * @param {Function} onLinkUpdated  - Called with the updated link whenever its
 *                                    contentStatus changes so parent stays in sync
 */
export default function LinkModal({ link: initialLink, onClose, onLinkUpdated }) {
  const [link, setLink]                     = useState(initialLink)
  const [content, setContent]               = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError]     = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [citationRefreshing, setCitationRefreshing] = useState(false)
  const [citationTooltip,    setCitationTooltip]    = useState(false)
  const [activeTab, setActiveTab]           = useState('content')
  const [feedback, setFeedback]             = useState(null)   // null=not loaded, []=loaded
  const [feedbackOpen, setFeedbackOpen]     = useState(false)
  const [editingTitle, setEditingTitle]     = useState(false)
  const [titleDraft,   setTitleDraft]       = useState(initialLink.title)
  const titleInputRef                       = useRef(null)
  const pollRef                             = useRef(null)

  // Auto-fetch citation count on open for arxiv links that don't have one yet
  const isArxiv = /arxiv\.org/i.test(link.url)
  useEffect(() => {
    if (!isArxiv || link.citationCount != null) return
    refreshCitations(link.id)
      .then(updated => updateLink(updated))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Switch to PDF tab automatically the first time a pdfFile appears
  const prevPdfRef = useRef(initialLink.pdfFile)
  useEffect(() => {
    if (link.pdfFile && !prevPdfRef.current) {
      setActiveTab('pdf')
    }
    prevPdfRef.current = link.pdfFile
  }, [link.pdfFile])

  // Load content text whenever the link transitions to 'parsed'
  useEffect(() => {
    if (link.contentStatus !== 'parsed' || content) return
    setContentLoading(true)
    getContent(link.id)
      .then(r => {
        const cleaned = r.text
          .split('\n')
          .map(l => l.trimStart())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        setContent(cleaned)
        setContentLoading(false)
      })
      .catch(() => { setContentError('Could not load content.'); setContentLoading(false) })
  }, [link.contentStatus, link.id, content])

  // While pending, poll every 3 s for a status change
  useEffect(() => {
    if (link.contentStatus === 'pending' && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await getLink(link.id).catch(() => null)
        if (updated) updateLink(updated)
      }, 3000)
    } else if (link.contentStatus !== 'pending' && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [link.contentStatus, link.id])

  const updateLink = (updated) => {
    setLink(updated)
    onLinkUpdated?.(updated)
  }

  const startTitleEdit = () => {
    setTitleDraft(link.title)
    setEditingTitle(true)
    setTimeout(() => { titleInputRef.current?.select() }, 0)
  }

  const commitTitle = async () => {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (!trimmed || trimmed === link.title) return
    try {
      const updated = await updateLinkTitle(link.id, trimmed)
      updateLink(updated)
    } catch {}
  }

  const cancelTitle = () => {
    setEditingTitle(false)
    setTitleDraft(link.title)
  }

  const handleRefreshCitations = async () => {
    setCitationRefreshing(true)
    try {
      const updated = await refreshCitations(link.id)
      updateLink(updated)
    } catch {}
    setCitationRefreshing(false)
  }

  const toggleFeedback = async () => {
    if (!feedbackOpen && feedback === null) {
      try {
        const items = await getFeedback(link.url)
        setFeedback(items)
      } catch {
        setFeedback([])
      }
    }
    setFeedbackOpen(o => !o)
  }

  const handleSaveContent = async () => {
    setSaving(true)
    try {
      const updated = await saveContent(link.id)
      updateLink(updated)
    } catch (_) {}
    setSaving(false)
  }

  const hasPdf  = Boolean(link.pdfFile)
  const showTabs = link.contentStatus === 'parsed' && hasPdf

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog link-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="dialog-header">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="link-modal-title-input"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitTitle()
                if (e.key === 'Escape') cancelTitle()
              }}
            />
          ) : (
            <span className="dialog-title link-modal-title-wrap">
              <span
                className="link-modal-title"
                onClick={startTitleEdit}
                title="Click to rename"
              >
                {link.title || link.url}
              </span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-modal-title-ext"
                title="Open in new tab"
              >
                ↗
              </a>
            </span>
          )}
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        {/* ── Metadata strip ──────────────────────────────────────── */}
        <div className="link-modal-meta-strip">
          <div className="link-modal-url">{link.url}</div>
          {link.notes && <div className="link-modal-notes">{link.notes}</div>}
          <div className="link-modal-meta-row">
            <div className="link-modal-meta">
              Added {fmtDate(link.createdAt)}
              {link.contentParsedAt && ` · Content saved ${fmtDate(link.contentParsedAt)}`}
            </div>

            {/* Citation count — arxiv links only */}
            {isArxiv && (
              <div
                className="citation-count-wrap"
                onMouseEnter={() => setCitationTooltip(true)}
                onMouseLeave={() => setCitationTooltip(false)}
              >
                {link.citationCount != null ? (
                  <span className="citation-count">
                    {link.citationCount.toLocaleString()} citations
                  </span>
                ) : (
                  <span className="citation-count citation-count-loading">
                    {citationRefreshing ? 'Fetching citations…' : '— citations'}
                  </span>
                )}
                {citationTooltip && link.citationCount != null && (
                  <div className="citation-tooltip">
                    <div className="citation-tooltip-date">
                      Last updated {new Date(link.citationCountAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <button
                      className="citation-refresh-btn"
                      onClick={handleRefreshCitations}
                      disabled={citationRefreshing}
                    >
                      {citationRefreshing ? 'Refreshing…' : '↻ Refresh'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Tab bar (only when PDF is available) ────────────────── */}
        {showTabs && (
          <div className="link-modal-tabs">
            <button
              className={`link-modal-tab${activeTab === 'content' ? ' active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              Content
            </button>
            <button
              className={`link-modal-tab${activeTab === 'pdf' ? ' active' : ''}`}
              onClick={() => setActiveTab('pdf')}
            >
              PDF
            </button>
          </div>
        )}

        {/* ── PDF tab panel ───────────────────────────────────────── */}
        {showTabs && activeTab === 'pdf' && (
          <div className="link-modal-pdf-panel">
            <div className="link-modal-pdf-bar">
              <a
                href={`/${link.pdfFile}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-modal-pdf-open-link"
              >
                Open in new tab ↗
              </a>
            </div>

            <iframe
              src={`/${link.pdfFile}`}
              className="link-modal-pdf-frame-full"
              title="PDF viewer"
            />
          </div>
        )}

        {/* ── Content tab panel (or full body when no tabs) ───────── */}
        {(!showTabs || activeTab === 'content') && (
          <div className="link-modal-body">
            <div className="link-modal-content-section">

              {/* No content yet */}
              {!link.contentStatus && (
                <div className="link-modal-cta">
                  <p>No page content saved yet.</p>
                  <button className="primary" onClick={handleSaveContent} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Page Content'}
                  </button>
                  <p className="link-modal-cta-hint">
                    For best results, use the browser extension on the open page.
                  </p>
                </div>
              )}

              {/* Pending */}
              {link.contentStatus === 'pending' && (
                <div className="link-modal-pending">
                  <span className="link-modal-spinner" />
                  Fetching page content…
                </div>
              )}

              {/* Failed */}
              {link.contentStatus === 'failed' && (
                <div className="link-modal-failed">
                  <span className="link-modal-failed-msg">
                    {link.contentError || 'Failed to fetch content.'}
                  </span>
                  <button className="content-action-btn" onClick={handleSaveContent} disabled={saving}>
                    {saving ? '…' : 'Retry'}
                  </button>
                </div>
              )}

              {/* Parsed — abstract, summary, text */}
              {link.contentStatus === 'parsed' && (
                <>
                  {link.abstract && (
                    <div className="link-modal-abstract">
                      <div className="link-modal-section-label">Abstract</div>
                      <p className="link-modal-abstract-text">{link.abstract}</p>
                    </div>
                  )}

                  {link.summary && (
                    <div className="link-modal-summary">
                      <div className="link-modal-section-label">AI Summary</div>
                      <p className="link-modal-summary-text">{link.summary}</p>
                    </div>
                  )}

                  <div className="link-modal-content">
                    {contentLoading && <p className="content-viewer-loading">Loading…</p>}
                    {contentError   && <p className="content-viewer-error">{contentError}</p>}
                    {content && (
                      <>
                        {link.contentTruncated && (
                          <p className="content-viewer-notice">
                            ⚠ Content was truncated at 200,000 characters.
                          </p>
                        )}
                        <pre className="content-viewer-text">{content}</pre>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* ── Comments (feedback from Parse History) ─────────── */}
              <div className="link-modal-feedback-section">
                <button className="link-modal-feedback-toggle" onClick={toggleFeedback}>
                  <span>Comments</span>
                  <span className="feedback-toggle-arrow">{feedbackOpen ? '▲' : '▼'}</span>
                </button>
                {feedbackOpen && (
                  <div className="link-modal-feedback-list">
                    {feedback === null && <p className="feedback-loading">Loading…</p>}
                    {feedback && feedback.length === 0 && (
                      <p className="feedback-empty">No comments yet. Add feedback after running Parse History.</p>
                    )}
                    {feedback && feedback.map(f => (
                      <div key={f.id} className="feedback-item">
                        <div className="feedback-item-header">
                          <span className={`feedback-decision-badge ${f.decision}`}>
                            {f.decision === 'keep' ? '✓ Kept' : '✕ Dropped'}
                          </span>
                          <span className="feedback-date">{fmtDate(f.createdAt)}</span>
                        </div>
                        {f.reason && <p className="feedback-reason">{f.reason}</p>}
                        <p className="feedback-comment">"{f.comment}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

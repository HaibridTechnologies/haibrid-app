import { useState, useEffect, useRef, useMemo } from 'react'
import { getLink, updateLinkTitle, updateLinkNotes, toggleLink } from '../../api/linksApi'
import { getContent, saveContent } from '../../api/contentApi'
import { getFeedback } from '../../api/visitsApi'
import { fmtDate, fmtDwellCompact } from '../../utils/date'
import { cleanContentText } from '../../utils/content'
import CitationBadge from './CitationBadge'
import CommentsSection from './CommentsSection'

/**
 * Detail modal for a single link.
 *
 * @param {Object}     link           - Link object from the reading list
 * @param {Object[]}   allProjects    - Full project list for rendering project chips
 * @param {Function}   onClose        - Called when the modal should be dismissed
 * @param {Function}   onLinkUpdated  - Called with the updated link on any change
 */
export default function LinkModal({ link: initialLink, allProjects = [], onClose, onLinkUpdated }) {
  const [link, setLink]                     = useState(initialLink)
  const [content, setContent]               = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError]     = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [activeTab, setActiveTab]           = useState('content')
  const [feedback, setFeedback]             = useState(null)
  const [feedbackOpen, setFeedbackOpen]     = useState(false)

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft,   setTitleDraft]   = useState(initialLink.title)
  const titleInputRef                   = useRef(null)

  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft,   setNotesDraft]   = useState(initialLink.notes || '')
  const notesInputRef                   = useRef(null)

  const pollRef = useRef(null)

  const isArxiv = useMemo(() => /arxiv\.org/i.test(link.url), [link.url])

  // Switch to PDF tab automatically the first time a pdfFile appears
  const prevPdfRef = useRef(initialLink.pdfFile)
  useEffect(() => {
    if (link.pdfFile && !prevPdfRef.current) setActiveTab('pdf')
    prevPdfRef.current = link.pdfFile
  }, [link.pdfFile])

  // Load content text whenever the link transitions to 'parsed'
  useEffect(() => {
    if (link.contentStatus !== 'parsed' || content) return
    setContentLoading(true)
    getContent(link.id)
      .then(r => {
        setContent(cleanContentText(r.text))
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

  // ── Title editing ──────────────────────────────────────────────────────────
  const startTitleEdit = () => {
    setTitleDraft(link.title)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }
  const commitTitle = async () => {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (!trimmed || trimmed === link.title) return
    try { updateLink(await updateLinkTitle(link.id, trimmed)) } catch (err) { console.error('[LinkModal] title update failed:', err) }
  }
  const cancelTitle = () => { setEditingTitle(false); setTitleDraft(link.title) }

  // ── Notes editing ──────────────────────────────────────────────────────────
  const startNotesEdit = () => {
    setNotesDraft(link.notes || '')
    setEditingNotes(true)
    setTimeout(() => notesInputRef.current?.focus(), 0)
  }
  const commitNotes = async () => {
    setEditingNotes(false)
    if (notesDraft === (link.notes || '')) return
    try { updateLink(await updateLinkNotes(link.id, notesDraft)) } catch (err) { console.error('[LinkModal] notes update failed:', err) }
  }
  const cancelNotes = () => { setEditingNotes(false); setNotesDraft(link.notes || '') }

  // ── Read toggle ────────────────────────────────────────────────────────────
  const handleToggleRead = async () => {
    try { updateLink(await toggleLink(link.id)) } catch (err) { console.error('[LinkModal] toggle failed:', err) }
  }

  // ── Feedback ───────────────────────────────────────────────────────────────
  const toggleFeedback = async () => {
    if (!feedbackOpen && feedback === null) {
      try { setFeedback(await getFeedback(link.url)) }
      catch (err) { console.error('[LinkModal] feedback load failed:', err); setFeedback([]) }
    }
    setFeedbackOpen(o => !o)
  }

  // ── Save / refresh content ─────────────────────────────────────────────────
  const handleSaveContent = async () => {
    setSaving(true)
    setContent(null)       // clear stale cached text so pending spinner shows
    setContentError(null)
    try { updateLink(await saveContent(link.id)) } catch (err) {
      console.error('[LinkModal] content save failed:', err)
      setContentError('Could not save content.')
    }
    setSaving(false)
  }

  const hasPdf   = Boolean(link.pdfFile)
  // Show tabs whenever a PDF exists — content tab may show failed/pending state
  // but the PDF should always be accessible if it was previously downloaded.
  const showTabs = hasPdf
  const dwell    = fmtDwellCompact(link.totalDwellSeconds)

  // Projects that belong to this link
  const linkProjects = allProjects.filter(p => (link.projects || []).includes(p.id))

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

          {/* Notes — click to edit inline */}
          {editingNotes ? (
            <textarea
              ref={notesInputRef}
              className="link-modal-notes-input"
              value={notesDraft}
              rows={2}
              placeholder="Add notes…"
              onChange={e => setNotesDraft(e.target.value)}
              onBlur={commitNotes}
              onKeyDown={e => {
                if (e.key === 'Escape') cancelNotes()
                if (e.key === 'Enter' && e.metaKey) commitNotes()
              }}
            />
          ) : (
            <div
              className={`link-modal-notes${link.notes ? '' : ' link-modal-notes-empty'}`}
              onClick={startNotesEdit}
              title="Click to edit notes"
            >
              {link.notes || 'Add notes…'}
            </div>
          )}

          {/* Dates + dwell row */}
          <div className="link-modal-meta-row">
            <div className="link-modal-meta">
              Added {fmtDate(link.createdAt)}
              {link.contentParsedAt && ` · Content saved ${fmtDate(link.contentParsedAt)}`}
              {dwell && ` · ${dwell} on page`}
            </div>

            <div className="link-modal-meta-right">
              {(isArxiv || link.citationCount != null) && (
                <CitationBadge link={link} onLinkUpdated={updateLink} />
              )}

              {/* Read/Unread toggle */}
              <button
                className={`link-modal-read-btn${link.read ? ' is-read' : ''}`}
                onClick={handleToggleRead}
                title={link.read ? 'Mark as unread' : 'Mark as read'}
              >
                {link.read ? 'Read' : 'Unread'}
              </button>
            </div>
          </div>

          {/* Project chips */}
          {linkProjects.length > 0 && (
            <div className="link-modal-projects">
              {linkProjects.map(p => (
                <span
                  key={p.id}
                  className="link-modal-project-chip"
                  style={{ borderColor: p.color, color: p.color }}
                >
                  <span className="link-modal-project-dot" style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── User comments ───────────────────────────────────────── */}
        <CommentsSection link={link} onLinkUpdated={updateLink} />

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

              {/* No content yet — extension is the primary path */}
              {!link.contentStatus && (
                <div className="link-modal-cta">
                  <p className="link-modal-cta-primary">
                    Open this page in your browser and click <strong>Save Content</strong> in the Haibrid extension for best results.
                  </p>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={handleSaveContent}
                    disabled={saving}
                  >
                    {saving ? 'Fetching…' : 'Fetch from server instead'}
                  </button>
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
                  <div className="link-modal-content-header">
                    <span className="link-modal-section-label">Saved content</span>
                    <button
                      className="btn-ghost btn-sm link-modal-refresh-btn"
                      onClick={handleSaveContent}
                      disabled={saving}
                      title="Re-fetch content from server"
                    >
                      {saving ? '…' : '↻ Refresh'}
                    </button>
                  </div>
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

              {/* ── Parse History Feedback ──────────────────────────── */}
              <div className="link-modal-feedback-section">
                <button className="link-modal-feedback-toggle" onClick={toggleFeedback}>
                  <span>Parse History Feedback</span>
                  <span className="feedback-toggle-arrow">{feedbackOpen ? '▲' : '▼'}</span>
                </button>
                {feedbackOpen && (
                  <div className="link-modal-feedback-list">
                    {feedback === null && <p className="feedback-loading">Loading…</p>}
                    {feedback && feedback.length === 0 && (
                      <p className="feedback-empty">No feedback yet. Appears after running Parse History.</p>
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

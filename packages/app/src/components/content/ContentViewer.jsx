import { useState, useEffect } from 'react'
import { getContent } from '../../api/contentApi'

/**
 * Modal overlay that displays the plain-text content saved for a link.
 *
 * Fetches the text via the API when the component mounts (i.e. when a link
 * is selected in ContentPage).  Shows a loading state, an error state, and
 * a truncation notice if the original page exceeded the 100 K character limit.
 *
 * Clicking the overlay backdrop calls `onClose` so the user can dismiss
 * without reaching the × button.
 *
 * @param {Object}   link     - Link whose content to display (must have `.id`, `.title`)
 * @param {Function} onClose  - Called when the dialog should be dismissed
 */
export default function ContentViewer({ link, onClose }) {
  const [text, setText]   = useState(null)
  const [error, setError] = useState(null)

  // Load content when the viewed link changes
  useEffect(() => {
    getContent(link.id)
      .then(r => {
        const cleaned = r.text
          .split('\n')
          .map(l => l.trimStart())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        setText(cleaned)
      })
      .catch(() => setError('Could not load content.'))
  }, [link.id])

  return (
    <div className="dialog-overlay" onClick={onClose}>
      {/* Stop propagation so clicks inside the dialog don't close the overlay */}
      <div className="dialog content-viewer-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <span className="dialog-title content-viewer-title">{link.title || link.url}</span>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="content-viewer-body">
          {error  && <p className="content-viewer-error">{error}</p>}
          {!text && !error && <p className="content-viewer-loading">Loading…</p>}
          {text && (
            <>
              {link.contentTruncated && (
                <p className="content-viewer-notice">
                  ⚠ Content was truncated at 100,000 characters.
                </p>
              )}
              <pre className="content-viewer-text">{text}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

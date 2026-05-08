import { useState, useRef } from 'react'
import { addComment, deleteComment } from '../../api/linksApi'
import { fmtDate } from '../../utils/date'

/**
 * User comments panel shown inside the link detail modal.
 * Renders the existing comment list, a delete button per comment,
 * and an add-comment form.
 *
 * @param {Object}   link           - Link object (must have id and comments array)
 * @param {Function} onLinkUpdated  - Called with the updated link after any change
 */
export default function CommentsSection({ link, onLinkUpdated }) {
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const inputRef              = useRef(null)

  const handleAdd = async () => {
    const text = draft.trim()
    if (!text) return
    setSaving(true)
    try {
      const updated = await addComment(link.id, text)
      onLinkUpdated?.(updated)
      setDraft('')
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (commentId) => {
    try {
      await deleteComment(link.id, commentId)
      onLinkUpdated?.({
        ...link,
        comments: (link.comments || []).filter(c => c.id !== commentId),
      })
    } catch {}
  }

  const comments = link.comments || []

  return (
    <div className="link-modal-comments">
      <div className="link-modal-section-label">Comments</div>

      {comments.map(c => (
        <div key={c.id} className="link-modal-comment">
          <div className="link-modal-comment-header">
            <span className="link-modal-comment-date">{fmtDate(c.createdAt)}</span>
            <button
              className="link-modal-comment-delete"
              onClick={() => handleDelete(c.id)}
              title="Delete comment"
            >
              ×
            </button>
          </div>
          <p className="link-modal-comment-text">{c.text}</p>
        </div>
      ))}

      <div className="link-modal-comment-form">
        <input
          ref={inputRef}
          className="link-modal-comment-input"
          type="text"
          placeholder="Add a comment…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          className="primary btn-sm"
          onClick={handleAdd}
          disabled={saving || !draft.trim()}
        >
          {saving ? '…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

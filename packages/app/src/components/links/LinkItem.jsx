import { useState, useRef } from 'react'
import { fmtDate } from '../../utils/date'
import { updateLinkTitle } from '../../api/linksApi'
import ProjectTagEditor from './ProjectTagEditor'

function safeUrl(url) {
  try { new URL(url); return url } catch { return '#' }
}

export default function LinkItem({ link, allProjects = [], onToggle, onDelete, onDetails, onTagsChange, onTitleChange }) {
  const [editing,   setEditing]   = useState(false)
  const [draft,     setDraft]     = useState(link.title)
  const inputRef                  = useRef(null)

  const startEdit = (e) => {
    e.preventDefault()          // don't follow the link
    setDraft(link.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = async () => {
    const trimmed = draft.trim()
    setEditing(false)
    if (!trimmed || trimmed === link.title) return
    try {
      const updated = await updateLinkTitle(link.id, trimmed)
      onTitleChange?.(updated)
    } catch {}
  }

  const cancel = () => {
    setEditing(false)
    setDraft(link.title)
  }

  return (
    <div className={`link-item${link.read ? ' is-read' : ''}`}>
      <button
        className={`toggle-btn${link.read ? ' done' : ''}`}
        title={link.read ? 'Mark unread' : 'Mark read'}
        onClick={() => onToggle(link)}
      />
      <div className="link-body">
        {editing ? (
          <input
            ref={inputRef}
            className="link-title-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter')  commit()
              if (e.key === 'Escape') cancel()
            }}
          />
        ) : (
          <a
            className="link-title"
            href={safeUrl(link.url)}
            target="_blank"
            rel="noopener noreferrer"
            onDoubleClick={startEdit}
            title="Double-click to rename"
          >
            {link.title}
          </a>
        )}
        <div className="link-url">{link.url}</div>
        {link.notes && <div className="link-notes">{link.notes}</div>}
        <ProjectTagEditor
          projectIds={link.projects || []}
          allProjects={allProjects}
          onChange={(ids) => onTagsChange(link, ids)}
        />
      </div>
      <div className="link-meta">
        <span className={`badge ${link.read ? 'read' : 'unread'}`}>
          {link.read ? 'Read' : 'Unread'}
        </span>
        <span className="meta-date">Added {fmtDate(link.createdAt)}</span>
        <button className="details-btn" title="View details" onClick={() => onDetails(link)}>
          ⓘ
        </button>
        <button className="delete-btn" title="Delete" onClick={() => onDelete(link)}>×</button>
      </div>
    </div>
  )
}

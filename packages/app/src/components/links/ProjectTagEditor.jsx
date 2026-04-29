import { useState, useRef, useEffect } from 'react'

/**
 * Inline project tag editor shown inside each link row.
 *
 * Renders the link's current project assignments as small coloured chips —
 * each chip has an × to remove the tag.  A "+" button opens a compact
 * dropdown listing projects not yet assigned, allowing the user to add one.
 *
 * @param {string[]}  projectIds  - IDs of projects currently on the link
 * @param {Object[]}  allProjects - Full project list from the server
 * @param {Function}  onChange    - Called with the new project ID array
 */
export default function ProjectTagEditor({ projectIds = [], allProjects = [], onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const assigned   = allProjects.filter(p => projectIds.includes(p.id))
  const unassigned = allProjects.filter(p => !projectIds.includes(p.id))

  const remove = (e, id) => {
    e.stopPropagation()
    onChange(projectIds.filter(pid => pid !== id))
  }

  const add = (e, id) => {
    e.stopPropagation()
    onChange([...projectIds, id])
    setOpen(false)
  }

  return (
    <div className="project-tag-editor" ref={wrapRef}>
      {assigned.map(p => (
        <span
          key={p.id}
          className="project-chip"
          style={{ '--chip-color': p.color || 'var(--accent)' }}
        >
          {p.name}
          <button
            className="chip-remove"
            title={`Remove "${p.name}"`}
            onMouseDown={(e) => remove(e, p.id)}
          >×</button>
        </span>
      ))}

      {unassigned.length > 0 && (
        <div className="chip-add-wrap">
          <button
            className="chip-add-btn"
            title="Add to project"
            onMouseDown={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          >+</button>
          {open && (
            <div className="chip-dropdown">
              {unassigned.map(p => (
                <button
                  key={p.id}
                  className="chip-dropdown-item"
                  onMouseDown={(e) => add(e, p.id)}
                >
                  <span className="chip-dot" style={{ background: p.color || 'var(--accent)' }} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

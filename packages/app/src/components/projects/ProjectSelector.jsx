import { useState, useRef, useEffect } from 'react'
import { useProjects } from '../../hooks/useProjects'

/**
 * A multi-select dropdown for assigning a link to one or more projects.
 *
 * Rendered in the link-add toolbar and (optionally) in the extension popup.
 * Closes automatically when the user clicks outside the component.
 *
 * An optional `lockedId` prevents a project from being de-selected — used
 * when adding a link inside a project view so the current project stays tagged.
 *
 * @param {string[]}    selected  - Array of currently selected project IDs
 * @param {Function}    onChange  - Called with the updated selected ID array
 * @param {string|null} lockedId  - Project ID that cannot be toggled off
 */
export default function ProjectSelector({ selected, onChange, lockedId = null }) {
  const { projects } = useProjects()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close the dropdown when a click lands outside this component
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) => {
    if (id === lockedId) return // locked project cannot be deselected
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  // Resolve full project objects for the trigger button label
  const selectedProjects = projects.filter(p => selected.includes(p.id))

  const label = selectedProjects.length === 0
    ? 'No project'
    : selectedProjects.length === 1
    ? selectedProjects[0].name
    : `${selectedProjects.length} projects`

  return (
    <div className="project-selector" ref={ref}>
      <button
        type="button"
        className={`project-selector-btn${selectedProjects.length > 0 ? ' has-selection' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {/* Show up to 3 colour dots for selected projects */}
        {selectedProjects.length > 0 && (
          <span className="project-selector-dots">
            {selectedProjects.slice(0, 3).map(p => (
              <span key={p.id} className="selector-dot" style={{ background: p.color }} />
            ))}
          </span>
        )}
        <span>{label}</span>
        <span className="selector-chevron">▾</span>
      </button>

      {open && (
        <div className="project-selector-dropdown">
          {projects.length === 0 ? (
            <div className="selector-empty">No projects yet</div>
          ) : (
            projects.map(p => {
              const isSelected = selected.includes(p.id)
              const isLocked   = p.id === lockedId
              return (
                <label
                  key={p.id}
                  className={`selector-option${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isLocked}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="selector-dot" style={{ background: p.color }} />
                  <span className="selector-option-name">{p.name}</span>
                  {isLocked && <span className="selector-lock">current</span>}
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

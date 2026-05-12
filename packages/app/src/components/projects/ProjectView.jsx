import { useState } from 'react'
import ReadingList from '../links/ReadingList'
import ProjectResearch from './ProjectResearch'

/**
 * Wraps the per-project experience with two tabs:
 *   - Links    — the existing ReadingList view
 *   - Research — bulk content loading + multi-doc chat
 *
 * @param {Object} project - The active project object
 */
export default function ProjectView({ project }) {
  const [tab, setTab] = useState('links')

  return (
    <>
      <div className="project-view-tabs">
        <button
          className={`project-view-tab${tab === 'links' ? ' active' : ''}`}
          onClick={() => setTab('links')}
        >
          Links
        </button>
        <button
          className={`project-view-tab${tab === 'research' ? ' active' : ''}`}
          onClick={() => setTab('research')}
        >
          Research
        </button>
      </div>

      {tab === 'links'    && <ReadingList project={project} />}
      {tab === 'research' && <ProjectResearch project={project} />}
    </>
  )
}

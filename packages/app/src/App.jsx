import { useState, useRef } from 'react'
import AppNav from './components/AppNav'
import ReadingList from './components/links/ReadingList'
import ProjectsPage from './components/projects/ProjectsPage'
import ContentPage from './components/content/ContentPage'
import TrackingPage from './components/tracking/TrackingPage'

export default function App() {
  const [activeTab, setActiveTab]       = useState('links')
  const [activeProject, setActiveProject] = useState(null)
  const listActionsRef = useRef(null)

  const handleOpenProject    = (project) => setActiveProject(project)
  const handleBackToProjects = () => setActiveProject(null)

  const handleSetTab = (tab) => {
    setActiveTab(tab)
    setActiveProject(null)
  }

  return (
    <>
      <AppNav
        activeTab={activeTab}
        setActiveTab={handleSetTab}
        activeProject={activeProject}
        onBackToProjects={handleBackToProjects}
        onImport={() => listActionsRef.current?.triggerImport()}
        onEnterSelect={() => listActionsRef.current?.enterSelect()}
      />
      {activeTab === 'links' && <ReadingList actionsRef={listActionsRef} />}
      {activeTab === 'projects' && !activeProject && (
        <ProjectsPage onOpenProject={handleOpenProject} />
      )}
      {activeTab === 'projects' && activeProject && (
        <ReadingList project={activeProject} actionsRef={listActionsRef} />
      )}
      {activeTab === 'content' && <ContentPage />}
      {activeTab === 'tracking' && <TrackingPage />}
    </>
  )
}

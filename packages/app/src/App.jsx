import { useState } from 'react'
import AppNav from './components/AppNav'
import ReadingList from './components/links/ReadingList'
import Tasks from './components/tasks/Tasks'
import ProjectsPage from './components/projects/ProjectsPage'
import ContentPage from './components/content/ContentPage'
import TrackingPage from './components/tracking/TrackingPage'

export default function App() {
  const [activeTab, setActiveTab] = useState('links')
  const [activeProject, setActiveProject] = useState(null)

  const handleOpenProject = (project) => setActiveProject(project)
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
      />
      {activeTab === 'links' && <ReadingList />}
      {activeTab === 'projects' && !activeProject && (
        <ProjectsPage onOpenProject={handleOpenProject} />
      )}
      {activeTab === 'projects' && activeProject && (
        <ReadingList project={activeProject} />
      )}
      {activeTab === 'tasks' && <Tasks />}
      {activeTab === 'content' && <ContentPage />}
      {activeTab === 'tracking' && <TrackingPage />}
    </>
  )
}

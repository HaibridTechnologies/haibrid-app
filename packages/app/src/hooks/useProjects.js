import { useState, useEffect, useCallback } from 'react'
import { getProjects, createProject, updateProject, deleteProject } from '../api/projectsApi'

/**
 * Manage the full list of projects.
 * Mutations (`add`, `update`, `remove`) optimistically update local state
 * so cards in the grid reflect changes immediately.
 */
export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)

  /** Fetch all projects from the server and replace local state. */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getProjects()
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load on mount
  useEffect(() => { load() }, [load])

  /** Create a project and optimistically prepend it to the list. */
  const add = useCallback(async ({ name, description, color }) => {
    const project = await createProject({ name, description, color })
    setProjects(prev => [project, ...prev])
    return project
  }, [])

  /** Partially update a project and replace it in the list in place. */
  const update = useCallback(async (id, updates) => {
    const project = await updateProject(id, updates)
    setProjects(prev => prev.map(p => p.id === id ? project : p))
    return project
  }, [])

  /** Delete a project and remove it from the local list. */
  const remove = useCallback(async (id) => {
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }, [])

  return { projects, loading, add, update, remove }
}

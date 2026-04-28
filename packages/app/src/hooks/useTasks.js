import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/tasksApi'

/**
 * Manage the task list including Eisenhower matrix scoring.
 *
 * Derived state:
 *   - `todo` — incomplete tasks (shown in the matrix / list)
 *   - `done` — completed tasks (shown in the collapsible Done section)
 *
 * `doneOpen` controls whether the Done section is expanded; it lives here
 * so it survives component re-renders triggered by task mutations.
 */
export function useTasks() {
  const [tasks, setTasks]       = useState([])
  const [isAdding, setIsAdding] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)

  /** Reload all tasks from the server. */
  const load = useCallback(async () => {
    const data = await api.getTasks()
    setTasks(data)
  }, [])

  // Initial load on mount
  useEffect(() => { load() }, [load])

  // Split into two derived lists — computed fresh on every render
  const todo = tasks.filter(t => !t.completed)
  const done = tasks.filter(t =>  t.completed)

  /** Add a new task and reload to receive the server-assigned ID. */
  const add = useCallback(async (text) => {
    if (!text.trim()) return
    setIsAdding(true)
    await api.addTask(text.trim())
    await load()
    setIsAdding(false)
  }, [load])

  /**
   * Partially update a task (text, scores, due date, completed flag).
   * Always syncs from the server afterwards to keep `completedAt` in sync.
   */
  const update = useCallback(async (id, data) => {
    await api.updateTask(id, data)
    await load()
  }, [load])

  /** Convenience wrapper for toggling the completed flag. */
  const complete = useCallback((id, completed) => update(id, { completed }), [update])

  /** Delete a task (fire-and-forget reload — no need to await). */
  const remove = useCallback(async (id) => {
    await api.deleteTask(id)
    load()
  }, [load])

  return { tasks, todo, done, isAdding, doneOpen, setDoneOpen, add, update, complete, remove }
}

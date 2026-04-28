import { useState } from 'react'
import { useTasks } from '../../hooks/useTasks'
import TaskList from './list/TaskList'
import MatrixView from './matrix/MatrixView'

export default function Tasks() {
  const [viewMode, setViewMode] = useState('list')
  const { tasks, todo, done, isAdding, doneOpen, setDoneOpen, add, update, complete, remove } = useTasks()
  const [text, setText] = useState('')

  const submit = async () => {
    if (!text.trim()) return
    await add(text.trim())
    setText('')
  }

  return (
    <>
      <div className="toolbar tasks-toolbar">
        <input
          type="text"
          placeholder="Add a task and press Enter…"
          autoComplete="off"
          className="tasks-add-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <button className="primary" onClick={submit} disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
        <div className="view-toggle">
          {['list', 'matrix'].map(v => (
            <button
              key={v}
              className={`view-btn${viewMode === v ? ' active' : ''}`}
              onClick={() => setViewMode(v)}
            >
              {v === 'list' ? 'List' : 'Matrix'}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'list' && (
        <main>
          <TaskList
            todo={todo}
            done={done}
            doneOpen={doneOpen}
            setDoneOpen={setDoneOpen}
            onUpdate={update}
            onComplete={complete}
            onDelete={remove}
          />
        </main>
      )}

      {viewMode === 'matrix' && (
        <MatrixView tasks={tasks} onUpdate={update} />
      )}
    </>
  )
}

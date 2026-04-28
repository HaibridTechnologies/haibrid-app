import TaskItem from './TaskItem'

export default function TaskList({ todo, done, doneOpen, setDoneOpen, onUpdate, onComplete, onDelete }) {
  return (
    <>
      <div className="list-count">
        {todo.length} task{todo.length !== 1 ? 's' : ''} to do
      </div>

      <div className="card">
        {todo.length === 0 ? (
          <div className="empty">No tasks yet — add one above.</div>
        ) : (
          todo.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              onComplete={onComplete}
              onDelete={onDelete}
            />
          ))
        )}

        {done.length > 0 && (
          <>
            <div
              className={`section-header${doneOpen ? ' open' : ''}`}
              onClick={() => setDoneOpen(!doneOpen)}
            >
              <span className="chevron">▶</span>
              Completed ({done.length})
            </div>
            {doneOpen && done.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onUpdate={onUpdate}
                onComplete={onComplete}
                onDelete={onDelete}
              />
            ))}
          </>
        )}
      </div>
    </>
  )
}

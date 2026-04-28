import { useRef } from 'react'
import { isOverdue } from '../../../utils/date'

export default function TaskItem({ task, onUpdate, onComplete, onDelete }) {
  const textRef = useRef(null)

  const saveText = () => {
    const text = textRef.current?.innerText.trim()
    if (text) onUpdate(task.id, { text })
    // if empty, the next render will revert to original
  }

  // Save score only on blur — avoids intermediate-empty-string issue that occurs
  // mid-typing in number inputs (e.g. while the user is typing "0." e.target.value === '')
  const handleScoreBlur = (field, value) => {
    const parsed = value === '' ? null : parseFloat(parseFloat(value).toFixed(2))
    if (isNaN(parsed)) return
    onUpdate(task.id, { [field]: parsed })
  }

  const overdue = isOverdue(task.dueDate) && !task.completed

  return (
    <div className={`task-item${task.completed ? ' is-done' : ''}`}>
      <button
        className={`toggle-btn${task.completed ? ' done' : ''}`}
        title={task.completed ? 'Mark to do' : 'Mark done'}
        onClick={() => onComplete(task.id, !task.completed)}
      />
      <div className="task-body">
        <span
          ref={textRef}
          className="task-text"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textRef.current.blur() } }}
          onBlur={saveText}
        >
          {task.text}
        </span>
        <div className="task-meta">
          <div className="score-group">
            <span className="score-label">I</span>
            <input
              className="score-input"
              type="number"
              min="-1" max="1" step="0.1"
              placeholder="—"
              defaultValue={task.important ?? ''}
              title="Importance (−1 to 1)"
              onBlur={e => handleScoreBlur('important', e.target.value)}
            />
          </div>
          <div className="score-group">
            <span className="score-label">U</span>
            <input
              className="score-input"
              type="number"
              min="-1" max="1" step="0.1"
              placeholder="—"
              defaultValue={task.urgent ?? ''}
              title="Urgency (−1 to 1)"
              onBlur={e => handleScoreBlur('urgent', e.target.value)}
            />
          </div>
          <div className={`task-due${overdue ? ' overdue' : ''}`}>
            <input
              type="date"
              defaultValue={task.dueDate ?? ''}
              onChange={e => onUpdate(task.id, { dueDate: e.target.value || null })}
            />
          </div>
        </div>
      </div>
      <button className="delete-btn" title="Delete" onClick={() => onDelete(task.id)}>×</button>
    </div>
  )
}

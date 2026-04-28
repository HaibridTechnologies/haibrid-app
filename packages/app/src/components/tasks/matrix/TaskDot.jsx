// Map scores to CSS percentages with 2% inset so dots never clip at edges
const INSET = 2
function toPercent(score) {
  return INSET + ((score + 1) / 2) * (100 - 2 * INSET)
}

export default function TaskDot({ task, onMouseDown, onMouseEnter, onMouseMove, onMouseLeave }) {
  const x =       toPercent(task.urgent)
  const y = 100 - toPercent(task.important)

  return (
    <div
      className={`task-dot${task.completed ? ' is-done' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    />
  )
}

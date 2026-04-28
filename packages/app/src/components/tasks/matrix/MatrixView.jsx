import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMatrixDrag } from '../../../hooks/useMatrixDrag'
import TaskDot from './TaskDot'

export default function MatrixView({ tasks, onUpdate }) {
  const gridRef = useRef(null)
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 })

  const { startDrag } = useMatrixDrag(gridRef, (id, scores) => onUpdate(id, scores))

  const scored   = tasks.filter(t => t.important !== null && t.urgent !== null)
  const unscored = tasks.filter(t => t.important === null || t.urgent  === null)

  const showTooltip = (text, e) => setTooltip({ visible: true, text, x: e.clientX, y: e.clientY })
  const moveTooltip = (e)       => setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))
  const hideTooltip = ()        => setTooltip(t => ({ ...t, visible: false }))

  return (
    <div className="tasks-matrix-view">
      {unscored.length > 0 && (
        <p className="matrix-hint">
          {unscored.length} task{unscored.length !== 1 ? 's' : ''} not shown —
          set both <strong>I</strong> and <strong>U</strong> scores in List view to plot them here.
        </p>
      )}
      {scored.length === 0 ? (
        <p className="matrix-empty">
          No tasks to plot yet. Add importance &amp; urgency scores in List view.
        </p>
      ) : (
        <div className="matrix-wrap">
          <div className="matrix-y-axis"><span>Important</span></div>
          <div className="matrix-grid" ref={gridRef}>
            <div className="q-bg tl" />
            <div className="q-bg tr" />
            <div className="q-bg bl" />
            <div className="q-bg br" />
            <div className="matrix-line h" />
            <div className="matrix-line v" />
            <div className="q-label tl">Schedule</div>
            <div className="q-label tr">Do First</div>
            <div className="q-label bl">Eliminate</div>
            <div className="q-label br">Delegate</div>
            {scored.map(task => (
              <TaskDot
                key={task.id}
                task={task}
                onMouseDown={e => {
                  const el = e.currentTarget
                  startDrag(task.id, el)(e)
                }}
                onMouseEnter={e => showTooltip(task.text, e)}
                onMouseMove={moveTooltip}
                onMouseLeave={hideTooltip}
              />
            ))}
          </div>
          <div />
          <div className="matrix-x-axis"><span>Urgent →</span></div>
        </div>
      )}

      {createPortal(
        <div
          className={`dot-tooltip${tooltip.visible ? ' visible' : ''}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  )
}

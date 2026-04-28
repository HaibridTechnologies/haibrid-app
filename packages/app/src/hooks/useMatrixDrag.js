import { useEffect, useRef } from 'react'

// Must match the INSET constant in TaskDot.jsx — both sides use it to map
// between pixel positions and the [-1, 1] score range.
const INSET = 2

/**
 * Convert a 0–1 position ratio (pixels / container size) to a score in [-1, 1].
 *
 * The forward mapping places score=–1 at INSET% from the edge and score=+1
 * at (100–INSET)% so dots never sit right on the grid border.
 *
 *   pct = INSET + ((score + 1) / 2) * (100 − 2 * INSET)
 *
 * This function inverts that formula.
 *
 * @param {number} ratio - Raw position ratio in [0, 1]
 * @returns {number}     Score in [-1, 1], rounded to 2 decimal places
 */
function pxToScore(ratio) {
  const pct = ratio * 100
  return parseFloat((((pct - INSET) / (100 - 2 * INSET)) * 2 - 1).toFixed(2))
}

/**
 * Attach document-level mouse listeners for dragging a task dot within the
 * Eisenhower matrix grid.
 *
 * The hook tracks which dot is being dragged via a ref (no re-renders during
 * drag), updates the element's CSS position in `onMouseMove`, and calls
 * `onDrop(id, { urgent, important })` with the final scores on `onMouseUp`.
 *
 * Event listeners are attached to `document` (not the grid) so dragging
 * doesn't break when the cursor briefly leaves the grid rectangle.
 *
 * @param {React.RefObject} gridRef - Ref to the grid container DOM element
 * @param {Function}        onDrop  - Called with (taskId, { urgent, important })
 * @returns {{ startDrag }} - `startDrag(id, el)` returns a mousedown handler
 */
export function useMatrixDrag(gridRef, onDrop) {
  const dragging = useRef(null) // { id, el } — null when no drag is active

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return
      const rect = gridRef.current?.getBoundingClientRect()
      if (!rect) return
      // Clamp to [0, 1] so the dot can't escape the grid
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height))
      dragging.current.el.style.left = `${x * 100}%`
      dragging.current.el.style.top  = `${y * 100}%`
    }

    const onMouseUp = (e) => {
      if (!dragging.current) return
      const rect = gridRef.current?.getBoundingClientRect()
      if (!rect) { dragging.current = null; return }

      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height))

      // x maps to urgency; y is inverted so the top of the grid = more important
      const urgent    = Math.max(-1, Math.min(1, pxToScore(x)))
      const important = Math.max(-1, Math.min(1, pxToScore(1 - y)))

      dragging.current.el.classList.remove('dragging')
      const id = dragging.current.id
      dragging.current = null // clear before callback to prevent re-entrancy
      onDrop(id, { urgent, important })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
    }
  }, [gridRef, onDrop])

  /**
   * Returns a `mousedown` handler that begins a drag for the given task dot.
   *
   * @param {string}      id - Task ID
   * @param {HTMLElement} el - The dot DOM element being dragged
   */
  const startDrag = (id, el) => (e) => {
    e.preventDefault()
    dragging.current = { id, el }
    el.classList.add('dragging')
  }

  return { startDrag }
}

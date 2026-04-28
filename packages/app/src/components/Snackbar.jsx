import { useEffect, useRef } from 'react'

/** Auto-dismiss duration in milliseconds. */
const DURATION = 5000

/**
 * Transient notification bar displayed at the bottom of the screen.
 *
 * Features:
 *   - Auto-dismisses after `DURATION` ms via a `setTimeout`.
 *   - Renders a CSS progress bar that shrinks over the same duration so the
 *     user has a visual countdown.
 *   - An optional action button (e.g. "Undo") clears the timer and fires
 *     `onAction` before dismissing.
 *
 * The parent should pass a changing `key` prop when replacing one snackbar
 * with another — this forces a full re-mount and resets the timer cleanly
 * (see `useSnackbar` for how `key: Date.now()` achieves this).
 *
 * @param {string}   message      - Text to display
 * @param {string}   actionLabel  - Optional button label (e.g. "Undo")
 * @param {Function} onAction     - Called when the action button is clicked
 * @param {Function} onDismiss    - Called when the snackbar should be hidden
 */
export default function Snackbar({ message, actionLabel, onAction, onDismiss }) {
  const timerRef = useRef(null)

  // Auto-dismiss after DURATION. Re-runs whenever `message` changes (new snackbar).
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onDismiss, DURATION)
    return () => clearTimeout(timerRef.current)
  }, [message, onDismiss])

  const handleAction = () => {
    clearTimeout(timerRef.current) // prevent auto-dismiss racing with undo
    onAction()
    onDismiss()
  }

  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span className="snackbar-message">{message}</span>
      <div className="snackbar-actions">
        {actionLabel && (
          <button className="snackbar-action" onClick={handleAction}>
            {actionLabel}
          </button>
        )}
        <button className="snackbar-close" aria-label="Dismiss" onClick={onDismiss}>
          ✕
        </button>
      </div>
      {/* CSS keyframe animation shrinks this bar from 100% → 0% over DURATION */}
      <div className="snackbar-progress" style={{ animationDuration: `${DURATION}ms` }} />
    </div>
  )
}

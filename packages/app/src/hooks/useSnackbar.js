import { useState, useCallback } from 'react'

/**
 * Manage a single snackbar notification slot.
 *
 * `key: Date.now()` is deliberately set on each `show` call so that when a
 * new snackbar replaces an existing one, the `<Snackbar>` component receives
 * a changed `key` prop and fully re-mounts — this restarts the progress bar
 * animation and the auto-dismiss timer from zero.
 *
 * @returns {{ snackbar, show, dismiss }}
 *   snackbar  — current notification state (null when hidden)
 *   show      — display a new snackbar; replaces any current one
 *   dismiss   — clear the snackbar immediately
 */
export function useSnackbar() {
  const [snackbar, setSnackbar] = useState(null)

  const show = useCallback(({ message, actionLabel, onAction }) => {
    setSnackbar({ message, actionLabel, onAction, key: Date.now() })
  }, [])

  const dismiss = useCallback(() => setSnackbar(null), [])

  return { snackbar, show, dismiss }
}

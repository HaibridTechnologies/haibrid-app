/**
 * Clean raw saved-content text for display.
 * Strips leading whitespace from each line and collapses runs of blank lines.
 *
 * @param {string} raw
 * @returns {string}
 */
export function cleanContentText(raw) {
  return raw
    .split('\n')
    .map(l => l.trimStart())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

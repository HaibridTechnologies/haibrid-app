'use strict';

/**
 * Convert an HTML string to readable plain text.
 *
 * Strategy:
 *   1. Remove entire non-content blocks (scripts, styles, navigation).
 *   2. Turn block-level closing tags into newlines to preserve paragraph breaks.
 *   3. Strip all remaining HTML tags.
 *   4. Decode common HTML entities.
 *   5. Normalise whitespace so the result is clean prose.
 *
 * This is intentionally a lightweight regex-based approach — good enough for
 * article and documentation pages without a full DOM parser dependency.
 *
 * @param {string} html
 * @returns {string}  Plain text, trimmed, with at most one blank line between paragraphs
 */
function htmlToText(html) {
  return html
    // ── Remove entire blocks that never contain readable content ────────────
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi,  '')
    .replace(/<nav[\s\S]*?<\/nav>/gi,      '')
    .replace(/<footer[\s\S]*?<\/footer>/gi,'')
    .replace(/<aside[\s\S]*?<\/aside>/gi,  '')
    .replace(/<header[\s\S]*?<\/header>/gi,'')
    // ── Block-level closing tags become line breaks ──────────────────────────
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|main)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // ── Strip remaining tags ─────────────────────────────────────────────────
    .replace(/<[^>]+>/g, '')
    // ── Decode common HTML entities ──────────────────────────────────────────
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')  // replace remaining entities with a space
    // ── Normalise whitespace ─────────────────────────────────────────────────
    .replace(/[ \t]+/g,  ' ')         // collapse horizontal whitespace
    .replace(/\n{3,}/g,  '\n\n')      // at most one blank line
    .trim();
}

module.exports = htmlToText;

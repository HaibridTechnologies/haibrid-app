/**
 * Minimal Markdown → HTML renderer for chat bubbles.
 * Handles: **bold**, *italic*, `code`, ``` code blocks ```,
 * - / * bullet lists, numbered lists, and line breaks.
 */
export function renderMarkdown(text) {
  // Escape HTML entities first to prevent XSS
  const esc = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Split into fenced code blocks vs normal text
  const parts = text.split(/(```[\s\S]*?```)/g);
  let html = '';

  for (const part of parts) {
    if (part.startsWith('```') && part.endsWith('```')) {
      // Fenced code block — strip the backticks and optional language tag
      const inner = part.slice(3, -3).replace(/^\w*\n?/, '');
      html += `<pre><code>${esc(inner)}</code></pre>`;
      continue;
    }

    // Process line by line for lists, then inline marks
    const lines = part.split('\n');
    let inList  = false;
    let listTag = '';
    let buf     = '';

    const flushList = () => {
      if (inList) { buf += `</${listTag}>`; inList = false; listTag = ''; }
    };

    for (const line of lines) {
      const ulMatch = line.match(/^[\s]*[-*]\s+(.*)/);
      const olMatch = line.match(/^[\s]*\d+\.\s+(.*)/);

      if (ulMatch) {
        if (!inList || listTag !== 'ul') { flushList(); buf += '<ul>'; inList = true; listTag = 'ul'; }
        buf += `<li>${inlineMarks(esc(ulMatch[1]))}</li>`;
      } else if (olMatch) {
        if (!inList || listTag !== 'ol') { flushList(); buf += '<ol>'; inList = true; listTag = 'ol'; }
        buf += `<li>${inlineMarks(esc(olMatch[1]))}</li>`;
      } else {
        flushList();
        const trimmed = line.trim();
        buf += trimmed === '' ? '<br>' : inlineMarks(esc(line)) + '<br>';
      }
    }
    flushList();
    html += buf;
  }

  // Clean up leading/trailing <br>
  return html.replace(/(<br>)+$/, '').replace(/^(<br>)+/, '');
}

function inlineMarks(s) {
  return s
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,   '<em>$1</em>')
    .replace(/_([^_]+)_/g,     '<em>$1</em>');
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const API_BASE     = 'http://localhost:3000/api';
export const API_LINKS    = `${API_BASE}/links`;
export const API_PROJECTS = `${API_BASE}/projects`;
export const API_CHAT     = `${API_BASE}/chat`;

export const PROJECT_COLORS = [
  '#2563eb', '#7c3aed', '#059669', '#d97706',
  '#dc2626', '#0891b2', '#db2777', '#64748b',
];

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Normalise a URL for deduplication.
 * NOTE: intentionally duplicated from packages/app/routes/links.js.
 * If you change logic here, update the server route to match.
 */
export function normaliseUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    if (u.hostname === 'youtu.be') {
      u.searchParams.delete('t');
      return u.toString();
    }
  } catch (_) {}
  return url;
}

export function randomColor() {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

export function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function truncate(str, max) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

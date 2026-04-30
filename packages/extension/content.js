'use strict';

/**
 * Content script — injected into every page.
 *
 * Responsibilities:
 *  1. If the current URL is saved and unread, inject a floating "Mark as read" chip.
 *  2. If the link has user comments, inject a single draggable sticky note with
 *     prev/next navigation when there are multiple comments.
 *     - A toggle button (bottom-left) shows/hides the note.
 *     - Shown/hidden state and note position are persisted in chrome.storage.local.
 *     - Default: shown when comments exist.
 */

const API_BASE = 'http://localhost:3000/api/links';

let linkId    = null;
let chip      = null;
let toast     = null;
let undoTimer = null;

/** Route all fetches through the background worker to avoid the
 *  Chrome local-network access permission prompt on third-party sites. */
function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_RELAY', url, options }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp) return reject(new Error('No response from background'));
      resolve(resp);
    });
  });
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageKey(url) {
  return `haibrid:notes:${url}`;
}

function getStoredState(url) {
  return new Promise(resolve => {
    chrome.storage.local.get(storageKey(url), result => {
      resolve(result[storageKey(url)] || {});
    });
  });
}

function saveStoredState(url, patch) {
  return new Promise(resolve => {
    chrome.storage.local.get(storageKey(url), result => {
      const merged = { ...(result[storageKey(url)] || {}), ...patch };
      chrome.storage.local.set({ [storageKey(url)]: merged }, resolve);
    });
  });
}

// ── Single sticky note with prev/next ────────────────────────────────────────

let noteEl      = null;
let noteVisible = true;
let noteIndex   = 0;
const pageUrl   = window.location.href;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderNoteContent(comments) {
  if (!noteEl) return;
  const c     = comments[noteIndex];
  const multi = comments.length > 1;

  noteEl.querySelector('.haibrid-note-date').textContent  = fmtDate(c.createdAt);
  noteEl.querySelector('.haibrid-note-text').textContent  = c.text;

  const counter = noteEl.querySelector('.haibrid-note-counter');
  const prev    = noteEl.querySelector('.haibrid-note-prev');
  const next    = noteEl.querySelector('.haibrid-note-next');

  counter.textContent  = multi ? `${noteIndex + 1} of ${comments.length}` : '';
  counter.hidden       = !multi;
  prev.hidden          = !multi;
  next.hidden          = !multi;
  prev.disabled        = noteIndex === 0;
  next.disabled        = noteIndex === comments.length - 1;
}

function makeDraggable(el) {
  let startX, startY, startLeft, startTop;

  const onMove = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const newLeft = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  startLeft + cx - startX));
    const newTop  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startTop  + cy - startY));
    el.style.left = newLeft + 'px';
    el.style.top  = newTop  + 'px';
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onUp);
    saveStoredState(pageUrl, {
      position: { x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) },
    });
  };

  const header = el.querySelector('.haibrid-note-header');
  header.addEventListener('mousedown', e => {
    if (e.target.closest('.haibrid-note-close')) return;
    e.preventDefault();
    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = parseInt(el.style.left, 10) || 0;
    startTop  = parseInt(el.style.top,  10) || 0;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
  header.addEventListener('touchstart', e => {
    if (e.target.closest('.haibrid-note-close')) return;
    startX    = e.touches[0].clientX;
    startY    = e.touches[0].clientY;
    startLeft = parseInt(el.style.left, 10) || 0;
    startTop  = parseInt(el.style.top,  10) || 0;
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
  }, { passive: true });
}

function createNote(comments, x, y) {
  noteEl = document.createElement('div');
  noteEl.className  = 'haibrid-sticky-note';
  noteEl.style.left = x + 'px';
  noteEl.style.top  = y + 'px';
  noteEl.innerHTML  = `
    <div class="haibrid-note-header">
      <span class="haibrid-note-date"></span>
      <button class="haibrid-note-close" title="Hide note">×</button>
    </div>
    <p class="haibrid-note-text"></p>
    <div class="haibrid-note-nav">
      <button class="haibrid-note-prev" title="Previous">‹</button>
      <span class="haibrid-note-counter"></span>
      <button class="haibrid-note-next" title="Next">›</button>
    </div>
  `;

  noteEl.querySelector('.haibrid-note-close').addEventListener('click', () => {
    noteEl.remove();
    noteEl      = null;
    noteVisible = false;
    saveStoredState(pageUrl, { shown: false });
  });

  noteEl.querySelector('.haibrid-note-prev').addEventListener('click', () => {
    if (noteIndex > 0) { noteIndex--; renderNoteContent(comments); }
  });
  noteEl.querySelector('.haibrid-note-next').addEventListener('click', () => {
    if (noteIndex < comments.length - 1) { noteIndex++; renderNoteContent(comments); }
  });

  makeDraggable(noteEl);
  renderNoteContent(comments);
  document.body.appendChild(noteEl);
}

async function initNotes(link) {
  const comments = link.comments || [];
  if (comments.length === 0) return;

  const state = await getStoredState(pageUrl);
  noteVisible  = state.shown !== undefined ? state.shown : true;
  const pos    = state.position || { x: 24, y: 80 };

  _comments = comments;
  _position = pos;
  if (noteVisible) createNote(comments, pos.x, pos.y);
}

// ── Mark-as-read chip ─────────────────────────────────────────────────────────

async function init() {
  try {
    const url  = window.location.href;
    const resp = await bgFetch(`${API_BASE}?q=${encodeURIComponent(url)}`);
    if (!resp.ok || !resp.body) return;
    const match = resp.body.find(l => l.url === url);
    if (!match) return;
    linkId = match.id;

    if (!match.read) injectChip();
    initNotes(match);
  } catch {
    // Server not running or extension context invalid — fail silently
  }
}

function injectChip() {
  chip = document.createElement('div');
  chip.id = 'haibrid-mark-read-chip';
  chip.innerHTML = `
    <span class="haibrid-chip-icon">
      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 10.5l3.5 3.5 6.5-7" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span class="haibrid-chip-label">Mark as read</span>
  `;
  chip.addEventListener('click', handleMarkRead);
  document.body.appendChild(chip);
}

async function handleMarkRead() {
  if (!linkId) return;
  chip.classList.add('haibrid-chip-loading');
  try {
    const resp = await bgFetch(`${API_BASE}/${linkId}/toggle`, { method: 'PATCH' });
    if (!resp.ok) throw new Error();
    chip.remove();
    chip = null;
    showToast('Marked as read', handleUndo);
  } catch {
    chip.classList.remove('haibrid-chip-loading');
  }
}

async function handleUndo() {
  try {
    await bgFetch(`${API_BASE}/${linkId}/toggle`, { method: 'PATCH' });
    injectChip();
  } catch {}
}

function showToast(message, onUndo) {
  if (toast) toast.remove();
  clearTimeout(undoTimer);
  toast = document.createElement('div');
  toast.id = 'haibrid-toast';
  toast.innerHTML = `
    <span class="haibrid-toast-msg">${message}</span>
    <button class="haibrid-toast-undo">Undo</button>
  `;
  toast.querySelector('.haibrid-toast-undo').addEventListener('click', () => {
    clearTimeout(undoTimer);
    dismissToast();
    onUndo?.();
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('haibrid-toast-visible'));
  undoTimer = setTimeout(dismissToast, 4000);
}

function dismissToast() {
  if (!toast) return;
  toast.classList.remove('haibrid-toast-visible');
  setTimeout(() => { toast?.remove(); toast = null; }, 220);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const style = document.createElement('style');
style.textContent = `
  #haibrid-mark-read-chip {
    position: fixed; bottom: 28px; right: 24px; z-index: 2147483646;
    display: flex; align-items: center; gap: 7px;
    background: #ffffff; border: 1.5px solid #A7F3D0; border-radius: 24px;
    padding: 8px 14px 8px 9px; cursor: pointer;
    box-shadow: 0 4px 16px rgba(15,28,53,0.13);
    transition: box-shadow 0.15s, transform 0.15s, opacity 0.15s;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px; font-weight: 600; color: #059669;
    user-select: none; opacity: 0.92;
  }
  #haibrid-mark-read-chip:hover { box-shadow: 0 6px 20px rgba(5,150,105,0.18); transform: translateY(-2px); opacity: 1; }
  #haibrid-mark-read-chip:active { transform: translateY(0); }
  #haibrid-mark-read-chip.haibrid-chip-loading { opacity: 0.5; pointer-events: none; }
  .haibrid-chip-icon {
    width: 22px; height: 22px; border-radius: 50%; background: #059669; color: #ffffff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .haibrid-chip-icon svg { width: 13px; height: 13px; }
  .haibrid-chip-label { white-space: nowrap; }

  #haibrid-toast {
    position: fixed; bottom: 24px; left: 50%;
    transform: translateX(-50%) translateY(12px); z-index: 2147483647;
    display: flex; align-items: center; gap: 12px;
    background: #1e293b; color: #f1f5f9; border-radius: 10px; padding: 10px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px; font-weight: 500; box-shadow: 0 8px 24px rgba(15,28,53,0.22);
    opacity: 0; transition: opacity 0.18s, transform 0.18s; white-space: nowrap;
  }
  #haibrid-toast.haibrid-toast-visible { opacity: 1; transform: translateX(-50%) translateY(0); }
  .haibrid-toast-undo { all: unset; color: #93c5fd; font-size: 13px; font-weight: 600; cursor: pointer; }
  .haibrid-toast-undo:hover { color: #bfdbfe; }

  /* ── Sticky note ── */
  .haibrid-sticky-note {
    position: fixed; z-index: 2147483644; width: 220px;
    background: #FFFDE7; border: 1px solid #F9E04B; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(15,28,53,0.14);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px;
  }
  .haibrid-note-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px 5px; background: #F9E04B; border-radius: 8px 8px 0 0;
    cursor: grab; user-select: none;
  }
  .haibrid-note-header:active { cursor: grabbing; }
  .haibrid-note-date { font-size: 11px; font-weight: 500; color: #7a6a00; }
  .haibrid-note-close {
    all: unset; font-size: 16px; color: #7a6a00; cursor: pointer; line-height: 1;
    transition: color 0.1s;
  }
  .haibrid-note-close:hover { color: #c53030; }
  .haibrid-note-text {
    padding: 8px 10px; margin: 0; color: #2d2a00;
    white-space: pre-wrap; word-break: break-word; line-height: 1.45;
  }
  .haibrid-note-nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 8px 6px; border-top: 1px solid #F9E04B;
  }
  .haibrid-note-prev, .haibrid-note-next {
    all: unset; font-size: 18px; font-weight: 700; color: #7a6a00;
    cursor: pointer; padding: 0 4px; line-height: 1; transition: color 0.1s;
  }
  .haibrid-note-prev:hover, .haibrid-note-next:hover { color: #2d2a00; }
  .haibrid-note-prev:disabled, .haibrid-note-next:disabled { opacity: 0.3; cursor: default; }
  .haibrid-note-counter { font-size: 11px; color: #7a6a00; font-weight: 500; }

`;
document.head.appendChild(style);

// ── Message listener (from popup) ────────────────────────────────────────────
// Listens for TOGGLE_NOTE messages sent by the popup's show/hide button.
// Responds with the current visibility state so the popup can update its label.
let _comments = null; // retain for re-show after hide
let _position = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'TOGGLE_NOTE') return;
  noteVisible = !noteVisible;
  if (noteVisible && _comments) {
    const pos = _position || { x: 24, y: 80 };
    createNote(_comments, pos.x, pos.y);
  } else {
    noteEl?.remove();
    noteEl = null;
  }
  saveStoredState(pageUrl, { shown: noteVisible });
  sendResponse({ shown: noteVisible });
});

init();

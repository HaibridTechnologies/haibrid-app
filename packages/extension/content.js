'use strict';

/**
 * Content script — injected into every page.
 *
 * If the current URL is saved in the reading list and is unread, injects a
 * floating "Mark as read" chip at the bottom-right of the page.
 * Clicking it marks the link as read via the API and shows a brief undo toast.
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

async function init() {
  try {
    const url = window.location.href;
    const resp = await bgFetch(`${API_BASE}?q=${encodeURIComponent(url)}`);
    if (!resp.ok || !resp.body) return;
    const match = resp.body.find(l => l.url === url && !l.read);
    if (!match) return;
    linkId = match.id;
    injectChip();
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
  // Trigger CSS transition
  requestAnimationFrame(() => toast.classList.add('haibrid-toast-visible'));

  undoTimer = setTimeout(dismissToast, 4000);
}

function dismissToast() {
  if (!toast) return;
  toast.classList.remove('haibrid-toast-visible');
  setTimeout(() => { toast?.remove(); toast = null; }, 220);
}

// Inject styles into the page
const style = document.createElement('style');
style.textContent = `
  #haibrid-mark-read-chip {
    position: fixed;
    bottom: 28px;
    right: 24px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 7px;
    background: #ffffff;
    border: 1.5px solid #A7F3D0;
    border-radius: 24px;
    padding: 8px 14px 8px 9px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(15,28,53,0.13);
    transition: box-shadow 0.15s, transform 0.15s, opacity 0.15s;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #059669;
    user-select: none;
    opacity: 0.92;
  }
  #haibrid-mark-read-chip:hover {
    box-shadow: 0 6px 20px rgba(5,150,105,0.18);
    transform: translateY(-2px);
    opacity: 1;
  }
  #haibrid-mark-read-chip:active {
    transform: translateY(0);
  }
  #haibrid-mark-read-chip.haibrid-chip-loading {
    opacity: 0.5;
    pointer-events: none;
  }
  .haibrid-chip-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #059669;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .haibrid-chip-icon svg {
    width: 13px;
    height: 13px;
  }
  .haibrid-chip-label {
    white-space: nowrap;
  }

  #haibrid-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(12px);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 12px;
    background: #1e293b;
    color: #f1f5f9;
    border-radius: 10px;
    padding: 10px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 8px 24px rgba(15,28,53,0.22);
    opacity: 0;
    transition: opacity 0.18s, transform 0.18s;
    white-space: nowrap;
  }
  #haibrid-toast.haibrid-toast-visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .haibrid-toast-undo {
    all: unset;
    color: #93c5fd;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.1s;
  }
  .haibrid-toast-undo:hover { color: #bfdbfe; }
`;
document.head.appendChild(style);

init();

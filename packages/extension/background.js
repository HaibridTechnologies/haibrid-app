'use strict';

console.log('[Haibrid] background.js loaded — v3');

/**
 * Background service worker — tracks active tab dwell time and POSTs meaningful
 * visits to the Express server.
 *
 * "Active time" = the tab is frontmost AND the browser window has focus.
 * Bounces (< minDwellSeconds) and filtered domains are silently discarded.
 *
 * State is persisted to chrome.storage.session so it survives the service
 * worker being suspended by Chrome between events (MV3 behaviour).
 */

const EXPRESS_URL = 'http://localhost:3000';

// Defaults — overwritten on startup by fetching GET /api/config from the server.
// Changing these values in packages/app/lib/config.js will be picked up
// automatically the next time the extension service worker starts.
let FILTERS_TTL_MS    = 60_000;
let DEFAULT_MIN_DWELL = 30;

// ─── In-memory state ──────────────────────────────────────────────────────────
// Mirrored to session storage on every mutation so a cold-start can restore it.

let activeTabId     = null;   // tab currently being timed
let activeSince     = null;   // timestamp (ms) when timing started
let windowFocused   = true;   // is the browser window focused?
let pending         = {};     // { [tabId]: { url, title, domain, accumulated, visitedAt } }

let filtersCache    = null;
let filtersCacheAt  = 0;

// ─── Fetch config defaults from server on startup ────────────────────────────
fetch(`${EXPRESS_URL}/api/config`)
  .then(r => r.json())
  .then(cfg => {
    if (cfg?.visits?.minDwellSeconds)  DEFAULT_MIN_DWELL = cfg.visits.minDwellSeconds;
    if (cfg?.visits?.filtersCacheTtlMs) FILTERS_TTL_MS   = cfg.visits.filtersCacheTtlMs;
  })
  .catch(() => { /* server not running — keep hardcoded defaults */ });

// ─── Restore state after service worker wake ─────────────────────────────────
chrome.storage.session.get(
  ['activeTabId', 'activeSince', 'windowFocused', 'pending'],
  (saved) => {
    if (saved.activeTabId   != null) activeTabId   = saved.activeTabId;
    if (saved.activeSince   != null) activeSince   = saved.activeSince;
    if (saved.windowFocused != null) windowFocused = saved.windowFocused;
    if (saved.pending       != null) pending       = saved.pending;
  }
);

function persist() {
  chrome.storage.session.set({ activeTabId, activeSince, windowFocused, pending });
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

/** Stop accumulating time for the current active tab. */
function pauseActive(now = Date.now()) {
  if (activeTabId != null && activeSince != null && windowFocused) {
    const elapsed = (now - activeSince) / 1000;
    if (pending[activeTabId]) pending[activeTabId].accumulated += elapsed;
  }
  activeSince = null;
}

/** Start accumulating time for a tab. */
function resumeActive(tabId, now = Date.now()) {
  activeTabId = tabId;
  activeSince = now;
}

// ─── Chrome event listeners ───────────────────────────────────────────────────

// User switches to a different tab
chrome.tabs.onActivated.addListener(({ tabId }) => {
  const now = Date.now();
  pauseActive(now);

  // Flush the tab we're leaving so the visit is recorded immediately on switch
  const leavingTabId = activeTabId;
  if (leavingTabId != null && leavingTabId !== tabId) {
    flushVisit(leavingTabId);
  }

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return;
    ensurePending(tabId, tab.url, tab.title);
    if (windowFocused) resumeActive(tabId, now);
    persist();
  });
});

// Browser window gains or loses focus
chrome.windows.onFocusChanged.addListener((windowId) => {
  const now = Date.now();
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    pauseActive(now);
    // Flush the active tab when the user leaves the browser entirely
    if (activeTabId != null) flushVisit(activeTabId);
    windowFocused = false;
  } else {
    windowFocused = true;
    // Re-seed the pending entry so timing can resume for the returning tab
    if (activeTabId != null) {
      chrome.tabs.get(activeTabId, (tab) => {
        if (chrome.runtime.lastError || !tab?.url) return;
        ensurePending(activeTabId, tab.url, tab.title);
        resumeActive(activeTabId, now);
        persist();
      });
    }
  }
  persist();
});

// Page navigation completes (new URL in an existing tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url) return;
  const now = Date.now();

  if (tabId === activeTabId) {
    pauseActive(now);
    flushVisit(tabId); // flush the previous URL
  }

  ensurePending(tabId, tab.url, tab.title);
  if (tabId === activeTabId && windowFocused) resumeActive(tabId, now);
  persist();
});

// Tab closed — flush whatever dwell time was accumulated
chrome.tabs.onRemoved.addListener((tabId) => {
  const now = Date.now();
  if (tabId === activeTabId) {
    pauseActive(now);
    activeTabId = null;
    activeSince = null;
  }
  flushVisit(tabId);
  persist();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensurePending(tabId, url, title) {
  if (!pending[tabId]) {
    let domain = '';
    try { domain = new URL(url).hostname; } catch {}
    pending[tabId] = { url, title: title || '', domain, accumulated: 0, visitedAt: new Date().toISOString() };
  }
}

async function flushVisit(tabId) {
  const visit = pending[tabId];
  if (!visit) { console.log('[Haibrid] flushVisit: no pending entry for tab', tabId); return; }
  delete pending[tabId];
  persist();

  // Skip browser-internal and non-HTTP pages
  if (!visit.url.startsWith('http')) { console.log('[Haibrid] flushVisit: skipping non-http', visit.url); return; }

  const filters = await getFilters();
  const minDwell = filters.minDwellSeconds ?? DEFAULT_MIN_DWELL;
  const decision = classify(visit.url, filters);

  console.log('[Haibrid] flushVisit:', visit.url, '| accumulated:', visit.accumulated, 's | minDwell:', minDwell, '| decision:', decision);

  // Block list → silently discard
  if (decision === 'block') { console.log('[Haibrid] blocked'); return; }

  // Dwell time only applies to unclassified domains —
  // fast-tracked domains are always recorded regardless of time spent
  if (decision !== 'allow' && visit.accumulated < minDwell) { console.log('[Haibrid] dwell too short, discarding'); return; }

  const payload = {
    url:          visit.url,
    title:        visit.title,
    domain:       visit.domain,
    dwellSeconds: Math.round(visit.accumulated),
    visitedAt:    visit.visitedAt,
  };

  // Allow list → record directly to history
  // Neither → send to pending queue for LLM evaluation
  const endpoint = decision === 'allow'
    ? `${EXPRESS_URL}/api/visits`
    : `${EXPRESS_URL}/api/visits/pending`;

  try {
    await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
  } catch {
    // Server not available — discard silently
  }
}

/**
 * Classify a full URL against the filter lists.
 * Returns 'block' | 'allow' | 'pending'
 */
function classify(url, filters) {
  let hostname = '', pathname = '/';
  try { const u = new URL(url); hostname = u.hostname; pathname = u.pathname; } catch {}

  const { blockList = [], allowList = [] } = filters;
  if (blockList.some(p => matchesPattern(hostname, pathname, p))) return 'block';
  if (allowList.length > 0 && allowList.some(p => matchesPattern(hostname, pathname, p))) return 'allow';
  return 'pending';
}

/**
 * Match a URL (hostname + pathname) against a pattern.
 *
 * Patterns:
 *   arxiv.org         -> any URL on arxiv.org
 *   arxiv.org/pdf     -> only URLs whose path starts with /pdf
 *   *.example.com     -> any subdomain of example.com
 */
function matchesPattern(hostname, pathname, pattern) {
  const p = pattern.trim().toLowerCase();
  const slashIdx = p.indexOf('/');
  const patternHost = slashIdx === -1 ? p : p.slice(0, slashIdx);
  const patternPath = slashIdx === -1 ? '' : p.slice(slashIdx);

  const h = hostname.toLowerCase();
  let hostMatch;
  if (patternHost.startsWith('*.')) {
    const base = patternHost.slice(2);
    hostMatch = h === base || h.endsWith('.' + base);
  } else {
    hostMatch = h === patternHost || h.endsWith('.' + patternHost);
  }
  if (!hostMatch) return false;

  if (patternPath) return pathname.toLowerCase().startsWith(patternPath);
  return true;
}


async function getFilters() {
  const now = Date.now();
  if (filtersCache && now - filtersCacheAt < FILTERS_TTL_MS) {
    console.log('[Haibrid] getFilters: returning cached', JSON.stringify(filtersCache));
    return filtersCache;
  }
  try {
    const res = await fetch(`${EXPRESS_URL}/api/visits/filters`);
    const data = await res.json();
    console.log('[Haibrid] getFilters: fetched from server', JSON.stringify(data));
    filtersCache = data;
    filtersCacheAt = now;
  } catch (err) {
    console.log('[Haibrid] getFilters: fetch FAILED', err?.message, '— using fallback', JSON.stringify(filtersCache));
    filtersCache = filtersCache ?? { blockList: [], allowList: [], minDwellSeconds: DEFAULT_MIN_DWELL };
  }
  return filtersCache;
}

// ─── Message relay — content scripts send requests here ──────────────────────
// Content scripts cannot safely fetch localhost directly (triggers Chrome's
// local-network permission prompt on some sites). They message the background
// worker instead, which makes the fetch and returns the result.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'FETCH_RELAY') return false;
  const { url, options } = msg;
  fetch(url, options)
    .then(async r => {
      const body = r.status === 204 ? null : await r.json().catch(() => null);
      sendResponse({ ok: r.ok, status: r.status, body });
    })
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true; // keep channel open for async response
});

// ─── Context menu ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       'haibrid-chat',
    title:    'Ask Haibrid about this',
    contexts: ['selection', 'page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'haibrid-chat') return;
  await chrome.storage.session.set({
    pendingChat: {
      selectedText: info.selectionText || null,
      url:          tab.url,
      tabId:        tab.id,
      timestamp:    Date.now(),
    },
  });
  try {
    // Opens the popup and switches it to the Chat tab.
    // chrome.action.openPopup() requires a user gesture; a context-menu click qualifies.
    await chrome.action.openPopup();
  } catch (e) {
    // Fallback: popup will read pendingChat the next time it opens naturally
    console.log('[Haibrid] openPopup failed (expected in some Chrome versions):', e?.message);
  }
});

/** Match hostname against a pattern.  *.example.com matches sub.example.com. */
function matchesDomain(hostname, pattern) {
  const p = pattern.trim().toLowerCase();
  const h = hostname.toLowerCase();
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith('.' + base);
  }
  return h === p || h.endsWith('.' + p);
}

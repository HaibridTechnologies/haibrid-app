const API_LINKS    = 'http://localhost:3000/api/links';
const API_PROJECTS = 'http://localhost:3000/api/projects';

// NOTE: This function is intentionally duplicated from packages/app/routes/links.js
// because the extension runs in a different runtime (browser, no Node modules).
// If you change URL normalisation logic here, update routes/links.js to match.
function normaliseUrl(url) {
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

const PROJECT_COLORS = [
  '#2563eb', '#7c3aed', '#059669', '#d97706',
  '#dc2626', '#0891b2', '#db2777', '#64748b',
];
function randomColor() {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Element refs ─────────────────────────────────────────────
  const titleInput      = document.getElementById('title');
  const urlInput        = document.getElementById('url');
  const notesInput      = document.getElementById('notes');
  const saveBtn         = document.getElementById('save-btn');
  const existingActions   = document.getElementById('existing-actions');
  const existingTitle     = document.getElementById('existing-title');
  const renameBtn         = document.getElementById('rename-btn');
  const saveContentBtn    = document.getElementById('save-content-btn');
  const contentStatusChip = document.getElementById('content-status-chip');
  const markReadBtn       = document.getElementById('mark-read-btn');
  const markReadCta       = document.getElementById('mark-read-cta');
  const removeBtn         = document.getElementById('remove-btn');
  const statusEl          = document.getElementById('status');
  const popupSnackbar     = document.getElementById('popup-snackbar');
  const popupSnackbarMsg  = document.getElementById('popup-snackbar-msg');
  const popupSnackbarUndo = document.getElementById('popup-snackbar-undo');
  const saveForm        = document.getElementById('save-form');
  const unreadList      = document.getElementById('unread-list');
  const tagInputWrap    = document.getElementById('tag-input-wrap');
  const chipsEl         = document.getElementById('chips');
  const projectSearch   = document.getElementById('project-search');
  const dropdown        = document.getElementById('project-dropdown');
  // existing-actions project editor
  const existingChipsEl    = document.getElementById('existing-chips');
  const existingProjSearch = document.getElementById('existing-project-search');
  const existingDropdown   = document.getElementById('existing-project-dropdown');
  // comments
  const commentsList    = document.getElementById('comments-list');
  const commentInput    = document.getElementById('comment-input');
  const commentAddBtn   = document.getElementById('comment-add-btn');
  const notesToggleBtn  = document.getElementById('notes-toggle-btn');

  let existingLink        = null;
  let allProjects         = [];
  let selectedProjects    = []; // { id, name, color } — for save form
  let existingProjects    = []; // { id, name, color } — for existing link

  // ── Tab switching ────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).hidden = false;
      if (tab.dataset.tab === 'list')   loadUnread();
      if (tab.dataset.tab === 'search') searchInput.focus();
      if (tab.dataset.tab === 'chat')   initChatTab();
    });
  });

  // ── Project tag input ────────────────────────────────────────

  function renderChips() {
    chipsEl.innerHTML = '';
    selectedProjects.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `
        <span class="chip-dot"></span>
        <span class="chip-name">${escHtml(p.name)}</span>
        <button class="chip-x" data-id="${p.id}" title="Remove">×</button>
      `;
      chip.querySelector('.chip-dot').style.background = p.color;
      chip.querySelector('.chip-x').addEventListener('click', e => {
        e.stopPropagation();
        selectedProjects = selectedProjects.filter(s => s.id !== p.id);
        renderChips();
        projectSearch.focus();
      });
      chipsEl.appendChild(chip);
    });
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    const selectedIds = new Set(selectedProjects.map(p => p.id));
    const matches = allProjects.filter(p =>
      !selectedIds.has(p.id) && p.name.toLowerCase().includes(q)
    );

    dropdown.innerHTML = '';

    // Show up to 6 matching projects
    matches.slice(0, 6).forEach(p => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      // Bold the matching part
      const label = q
        ? p.name.replace(new RegExp(`(${escRegex(q)})`, 'gi'), '<strong>$1</strong>')
        : escHtml(p.name);
      item.innerHTML = `
        <span class="item-dot"></span>
        <span class="item-name">${label}</span>
      `;
      item.querySelector('.item-dot').style.background = p.color;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        selectProject(p);
      });
      dropdown.appendChild(item);
    });

    // "Create" option when typed name doesn't exactly match any project
    const exactMatch = allProjects.some(
      p => p.name.toLowerCase() === q
    );
    if (query.trim() && !exactMatch) {
      const createItem = document.createElement('div');
      createItem.className = 'dropdown-item create-item';
      createItem.innerHTML = `
        <span class="create-plus">+</span>
        <span>Create <strong>"${escHtml(query.trim())}"</strong></span>
      `;
      createItem.addEventListener('mousedown', async e => {
        e.preventDefault();
        await createAndSelect(query.trim());
      });
      dropdown.appendChild(createItem);
    }

    const hasItems = dropdown.children.length > 0;
    dropdown.hidden = !hasItems;
  }

  function selectProject(project) {
    if (!selectedProjects.find(p => p.id === project.id)) {
      selectedProjects.push(project);
      renderChips();
    }
    projectSearch.value = '';
    dropdown.hidden = true;
    projectSearch.focus();
  }

  async function createAndSelect(name) {
    try {
      const res = await fetch(API_PROJECTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: randomColor() }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      allProjects.unshift(created);
      selectProject(created);
    } catch (_) {
      showStatus('Could not create project.', 'error');
    }
  }

  projectSearch.addEventListener('input', () => renderDropdown(projectSearch.value));
  projectSearch.addEventListener('focus', () => renderDropdown(projectSearch.value));
  projectSearch.addEventListener('blur',  () => setTimeout(() => { dropdown.hidden = true; }, 150));
  projectSearch.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.hidden = true; projectSearch.blur(); }
    // Backspace on empty input removes last chip
    if (e.key === 'Backspace' && !projectSearch.value && selectedProjects.length) {
      selectedProjects.pop();
      renderChips();
    }
  });

  // Clicking anywhere in the wrap focuses the input
  tagInputWrap.addEventListener('click', () => projectSearch.focus());

  // ── Load projects & check current URL ────────────────────────
  async function loadProjects() {
    try {
      const res = await fetch(API_PROJECTS);
      if (!res.ok) throw new Error();
      allProjects = await res.json();
    } catch (_) { allProjects = []; }
  }

  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    if (!tab) return;
    titleInput.value = tab.title || '';
    urlInput.value   = normaliseUrl(tab.url || '');

    await Promise.all([
      loadProjects(),
      (async () => {
        try {
          const res = await fetch(`${API_LINKS}?q=${encodeURIComponent(tab.url)}`);
          if (res.ok) {
            const links = await res.json();
            existingLink = links.find(l => l.url === tab.url) || null;
          }
        } catch (_) {}
      })(),
    ]);

    if (existingLink) {
      saveForm.hidden = true;
      existingActions.hidden = false;
      existingTitle.value = existingLink.title || '';
      // CTA only visible when unread; secondary btn only when already read
      markReadCta.hidden = existingLink.read;
      markReadBtn.hidden = !existingLink.read;
      setContentStatus(existingLink.contentStatus);
      // Populate existing project chips
      existingProjects = allProjects.filter(p => (existingLink.projects || []).includes(p.id));
      renderExistingChips();
      renderComments();
      const hasComments = (existingLink.comments || []).length > 0;
      notesToggleBtn.hidden = !hasComments;
      if (hasComments) syncNotesToggleBtn(tab.url);
    }
  });

  // ── Existing link — project editor ───────────────────────────

  function renderExistingChips() {
    existingChipsEl.innerHTML = '';
    existingProjects.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `
        <span class="chip-dot"></span>
        <span class="chip-name">${escHtml(p.name)}</span>
        <button class="chip-x" title="Remove">×</button>
      `;
      chip.querySelector('.chip-dot').style.background = p.color;
      chip.querySelector('.chip-x').addEventListener('click', e => {
        e.stopPropagation();
        existingProjects = existingProjects.filter(s => s.id !== p.id);
        renderExistingChips();
        saveExistingProjects();
      });
      existingChipsEl.appendChild(chip);
    });
  }

  function saveExistingProjects() {
    if (!existingLink) return;
    fetch(`${API_LINKS}/${existingLink.id}/projects`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projects: existingProjects.map(p => p.id) }),
    }).catch(() => {});
  }

  existingProjSearch.addEventListener('input', () => {
    const q = existingProjSearch.value.trim().toLowerCase();
    const matches = allProjects.filter(p =>
      !existingProjects.find(s => s.id === p.id) &&
      p.name.toLowerCase().includes(q)
    );
    existingDropdown.hidden = matches.length === 0;
    existingDropdown.innerHTML = '';
    matches.slice(0, 6).forEach(p => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.innerHTML = `<span class="item-dot"></span><span class="item-name">${escHtml(p.name)}</span>`;
      item.querySelector('.item-dot').style.background = p.color;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        existingProjects = [...existingProjects, p];
        renderExistingChips();
        saveExistingProjects();
        existingProjSearch.value = '';
        existingDropdown.hidden = true;
      });
      existingDropdown.appendChild(item);
    });
  });

  existingProjSearch.addEventListener('blur', () => {
    setTimeout(() => { existingDropdown.hidden = true; existingProjSearch.value = ''; }, 150);
  });

  // ── Comments ──────────────────────────────────────────────────

  // Sync toggle button label from chrome.storage.local for this URL
  async function syncNotesToggleBtn(url) {
    const key = `haibrid:notes:${url}`;
    chrome.storage.local.get(key, result => {
      const shown = result[key]?.shown !== false; // default true
      notesToggleBtn.textContent = shown ? '💬 Hide note' : '💬 Show note';
    });
  }

  notesToggleBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_NOTE' }, (resp) => {
      if (chrome.runtime.lastError) return; // content script not ready
      notesToggleBtn.textContent = resp?.shown ? '💬 Hide note' : '💬 Show note';
    });
  });

  function renderComments() {
    commentsList.innerHTML = '';
    const comments = existingLink?.comments || [];
    if (comments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'comments-empty';
      empty.textContent = 'No comments yet.';
      commentsList.appendChild(empty);
      return;
    }
    comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      const date = new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      item.innerHTML = `
        <div class="comment-item-header">
          <span class="comment-date">${escHtml(date)}</span>
          <button class="comment-delete" data-id="${escHtml(c.id)}" title="Delete">×</button>
        </div>
        <p class="comment-text">${escHtml(c.text)}</p>
      `;
      item.querySelector('.comment-delete').addEventListener('click', async () => {
        try {
          await fetch(`${API_LINKS}/${existingLink.id}/comments/${c.id}`, { method: 'DELETE' });
          existingLink.comments = (existingLink.comments || []).filter(x => x.id !== c.id);
          renderComments();
        } catch {}
      });
      commentsList.appendChild(item);
    });
  }

  async function submitComment() {
    const text = commentInput.value.trim();
    if (!text || !existingLink) return;
    commentAddBtn.disabled = true;
    try {
      const res = await fetch(`${API_LINKS}/${existingLink.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      existingLink = await res.json();
      commentInput.value = '';
      renderComments();
    } catch {
      showStatus('Could not add comment.', 'error');
    } finally {
      commentAddBtn.disabled = false;
    }
  }

  commentAddBtn.addEventListener('click', submitComment);
  commentInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitComment();
  });

  // ── Save ─────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const url   = urlInput.value.trim();
    const title = titleInput.value.trim();
    const notes = notesInput.value.trim();
    if (!url) { showStatus('No URL found for this tab.', 'error'); return; }

    saveBtn.disabled = true;
    hideStatus();

    try {
      const res = await fetch(API_LINKS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          title: title || undefined,
          notes: notes || undefined,
          projects: selectedProjects.map(p => p.id),
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Server error ${res.status}`);
      }
      showStatus('Saved to Haibrid!', 'success');
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => window.close(), 1400);
    } catch (err) {
      showStatus(err.message || 'Could not connect to the app.', 'error');
      saveBtn.disabled = false;
    }
  });

  // ── Rename ───────────────────────────────────────────────────
  existingTitle.addEventListener('input', () => {
    const changed = existingTitle.value.trim() !== (existingLink?.title || '');
    renameBtn.hidden = !changed;
  });

  existingTitle.addEventListener('keydown', e => {
    if (e.key === 'Enter') renameBtn.click();
    if (e.key === 'Escape') {
      existingTitle.value = existingLink?.title || '';
      renameBtn.hidden = true;
    }
  });

  renameBtn.addEventListener('click', async () => {
    const newTitle = existingTitle.value.trim();
    if (!newTitle || !existingLink) return;
    renameBtn.disabled = true;
    try {
      const res = await fetch(`${API_LINKS}/${existingLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error();
      existingLink.title = newTitle;
      renameBtn.hidden = true;
      showStatus('Title updated.', 'success');
      setTimeout(hideStatus, 1800);
    } catch (_) {
      showStatus('Could not update title.', 'error');
    } finally {
      renameBtn.disabled = false;
    }
  });

  // ── Save Content ─────────────────────────────────────────────────
  saveContentBtn.addEventListener('click', async () => {
    if (!existingLink) return;
    saveContentBtn.disabled = true;
    saveContentBtn.textContent = 'Saving…'; // restored by setContentStatus on success/error
    try {
      // Try to extract DOM text via scripting API
      let text = null;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const clone = document.body.cloneNode(true);
            // Remove non-content and script elements before extracting text.
            // script/style must be stripped explicitly because innerText on a
            // detached clone loses layout-awareness and falls back to textContent,
            // which includes raw script source.
            ['script', 'style', 'nav', 'footer', 'aside', 'header'].forEach(tag => {
              clone.querySelectorAll(tag).forEach(el => el.remove());
            });
            return (clone.innerText || clone.textContent || '').trim();
          },
        });
        if (result && result.result && result.result.length >= 20) {
          text = result.result;
        }
      } catch (_) {
        // scripting unavailable (restricted page) — server will fetch instead
      }

      const res = await fetch(`${API_LINKS}/${existingLink.id}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(text ? { text } : {}),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const updated = await res.json();
      const msg = updated.contentStatus === 'parsed'
        ? 'Content saved!'
        : 'Content is being fetched…';
      showStatus(msg, 'success');
      setContentStatus(updated.contentStatus);
      setTimeout(hideStatus, 2500);
    } catch (err) {
      showStatus(err.message || 'Could not save content.', 'error');
      setContentStatus(null);
    }
  });

  // ── Mark read CTA (unread → read, with snackbar undo) ────────
  markReadCta.addEventListener('click', async () => {
    if (!existingLink) return;
    markReadCta.disabled = true;
    try {
      const res = await fetch(`${API_LINKS}/${existingLink.id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      existingLink.read = true;
      markReadCta.hidden = true;
      markReadBtn.hidden = false;
      showPopupSnackbar('Marked as read', async () => {
        // Undo: toggle back
        await fetch(`${API_LINKS}/${existingLink.id}/toggle`, { method: 'PATCH' }).catch(() => {});
        existingLink.read = false;
        markReadCta.hidden = false;
        markReadCta.disabled = false;
        markReadBtn.hidden = true;
      });
    } catch {
      showStatus('Could not connect.', 'error');
      markReadCta.disabled = false;
    }
  });

  // ── Mark unread (secondary, shown only when already read) ─────
  markReadBtn.addEventListener('click', async () => {
    if (!existingLink) return;
    markReadBtn.disabled = true;
    try {
      const res = await fetch(`${API_LINKS}/${existingLink.id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      existingLink.read = false;
      markReadBtn.hidden = true;
      markReadCta.hidden = false;
      markReadCta.disabled = false;
      showPopupSnackbar('Marked as unread', async () => {
        await fetch(`${API_LINKS}/${existingLink.id}/toggle`, { method: 'PATCH' }).catch(() => {});
        existingLink.read = true;
        markReadBtn.hidden = false;
        markReadCta.hidden = true;
      });
    } catch (err) {
      showStatus(err.message || 'Could not connect.', 'error');
      markReadBtn.disabled = false;
    }
  });

  // ── Popup snackbar ────────────────────────────────────────────
  let snackbarTimer = null;

  function showPopupSnackbar(message, onUndo) {
    clearTimeout(snackbarTimer);
    popupSnackbarMsg.textContent = message;
    popupSnackbar.hidden = false;
    popupSnackbar.classList.add('visible');

    // Replace the undo listener each time
    const newUndo = popupSnackbarUndo.cloneNode(true);
    popupSnackbarUndo.replaceWith(newUndo);
    newUndo.addEventListener('click', () => {
      clearTimeout(snackbarTimer);
      hidePopupSnackbar();
      onUndo?.();
    });
    // Re-grab the reference after replacing
    Object.defineProperty(window, '_snackbarUndoEl', { value: newUndo, configurable: true });

    snackbarTimer = setTimeout(hidePopupSnackbar, 3000);
  }

  function hidePopupSnackbar() {
    popupSnackbar.classList.remove('visible');
    setTimeout(() => { popupSnackbar.hidden = true; }, 200);
  }

  removeBtn.addEventListener('click', async () => {
    if (!existingLink) return;
    removeBtn.disabled = true;
    try {
      const res = await fetch(`${API_LINKS}/${existingLink.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      showStatus('Removed from list.', 'success');
      setTimeout(() => window.close(), 1400);
    } catch (err) {
      showStatus(err.message || 'Could not connect.', 'error');
      removeBtn.disabled = false;
    }
  });

  // ── Unread tab ───────────────────────────────────────────────
  async function loadUnread() {
    unreadList.innerHTML = '<p class="list-empty">Loading…</p>';
    try {
      const res = await fetch(`${API_LINKS}?unread=true`);
      if (!res.ok) throw new Error();
      const links = await res.json();
      if (links.length === 0) {
        unreadList.innerHTML = '<p class="list-empty">No unread links.</p>';
        return;
      }
      unreadList.innerHTML = '';
      links.forEach(link => {
        const item = document.createElement('div');
        item.className = 'link-item';
        item.innerHTML = `
          <a class="link-title" href="${link.url}" target="_blank">${escHtml(link.title || link.url)}</a>
          <button class="link-mark-read" title="Mark as read">✓</button>
        `;
        item.querySelector('.link-mark-read').addEventListener('click', async e => {
          e.preventDefault();
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const r = await fetch(`${API_LINKS}/${link.id}/toggle`, { method: 'PATCH' });
            if (!r.ok) throw new Error();
            item.remove();
            if (!unreadList.children.length)
              unreadList.innerHTML = '<p class="list-empty">No unread links.</p>';
          } catch (_) { btn.disabled = false; }
        });
        unreadList.appendChild(item);
      });
    } catch (err) {
      const msg = err instanceof TypeError
        ? 'Server not reachable — is the app running?'
        : 'Could not load links.';
      unreadList.innerHTML = `<p class="list-empty">${msg}</p>`;
    }
  }

  // ── Search tab ───────────────────────────────────────────────

  const searchInput   = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let searchTimer     = null;

  function renderSearchResults(links) {
    searchResults.innerHTML = '';
    if (links.length === 0) {
      searchResults.innerHTML = '<p class="list-empty">No links found.</p>';
      return;
    }
    links.forEach(link => {
      const item = document.createElement('div');
      item.className = 'link-item';
      const host = (() => { try { return new URL(link.url).hostname; } catch { return link.url; } })();
      item.innerHTML = `
        <div class="search-item-main">
          <a class="link-title" href="${escHtml(link.url)}" target="_blank">${escHtml(link.title || link.url)}</a>
          <span class="search-item-host">${escHtml(host)}</span>
        </div>
        <button class="link-mark-read" title="${link.read ? 'Mark as unread' : 'Mark as read'}">${link.read ? '↩' : '✓'}</button>
      `;
      item.querySelector('.link-mark-read').addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await fetch(`${API_LINKS}/${link.id}/toggle`, { method: 'PATCH' });
          if (!r.ok) throw new Error();
          link.read = !link.read;
          btn.title = link.read ? 'Mark as unread' : 'Mark as read';
          btn.textContent = link.read ? '↩' : '✓';
        } catch { /* ignore */ } finally { btn.disabled = false; }
      });
      searchResults.appendChild(item);
    });
  }

  async function runSearch(q) {
    if (!q.trim()) { searchResults.innerHTML = ''; return; }
    searchResults.innerHTML = '<p class="list-empty">Searching…</p>';
    try {
      const res = await fetch(`${API_LINKS}?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      renderSearchResults(await res.json());
    } catch {
      searchResults.innerHTML = '<p class="list-empty">Could not reach the app.</p>';
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value), 250);
  });

  // ── Chat tab ─────────────────────────────────────────────────

  const chatBanner   = document.getElementById('chat-context-banner');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput    = document.getElementById('chat-input');
  const chatSendBtn  = document.getElementById('chat-send');

  const API_CHAT = 'http://localhost:3000/api/chat';

  // State for the current chat session
  let chatHistory      = [];    // [{ role, content }]
  let chatLinkId       = null;  // linkId if current page content is saved
  let chatSelectedText = null;  // text from context-menu selection
  let chatPageUrl      = null;
  let chatLoading      = false;
  let chatWebSearch    = false; // web search toggle state

  /** Render the context banner based on what's available. */
  function renderChatBanner() {
    chatBanner.innerHTML = '';

    const hasParsed = Boolean(chatLinkId);
    const hasSelect = Boolean(chatSelectedText);

    if (hasParsed && hasSelect) {
      appendBannerRow('✦', 'Page content + selected text', 'banner-both');
    } else if (hasParsed) {
      appendBannerRow('📄', 'Page content loaded', 'banner-content');
    } else if (hasSelect) {
      appendBannerRow('✏', truncate(chatSelectedText, 60), 'banner-selection');
    } else {
      // No context — offer to download if the link is saved but unparsed
      const noCtx = document.createElement('div');
      noCtx.className = 'banner-row banner-none';
      const msg = document.createElement('span');
      msg.textContent = 'No page context';
      noCtx.appendChild(msg);

      if (existingLink && existingLink.contentStatus !== 'parsed') {
        const dlBtn = document.createElement('button');
        dlBtn.className = 'banner-dl-btn';
        dlBtn.textContent = existingLink.contentStatus === 'pending' ? 'Fetching…' : 'Download page';
        dlBtn.disabled = existingLink.contentStatus === 'pending';
        dlBtn.addEventListener('click', downloadPageForChat);
        noCtx.appendChild(dlBtn);
      }

      chatBanner.appendChild(noCtx);
    }

    // Web search toggle — always shown at the end of the banner
    const webRow = document.createElement('div');
    webRow.className = 'banner-row banner-web-row';

    const webToggle = document.createElement('button');
    webToggle.className = `web-toggle${chatWebSearch ? ' active' : ''}`;
    webToggle.title = chatWebSearch
      ? 'Web search on — click to disable'
      : 'Web search off — click to enable';

    const globe = document.createElement('span');
    globe.textContent = '🌐';
    const label = document.createElement('span');
    label.textContent = 'Web';

    webToggle.appendChild(globe);
    webToggle.appendChild(label);
    webToggle.addEventListener('click', () => {
      chatWebSearch = !chatWebSearch;
      renderChatBanner();
    });

    webRow.appendChild(webToggle);
    chatBanner.appendChild(webRow);
  }

  function appendBannerRow(icon, text, cls) {
    const row = document.createElement('div');
    row.className = `banner-row ${cls}`;
    const ic = document.createElement('span');
    ic.className = 'banner-icon';
    ic.textContent = icon;
    const tx = document.createElement('span');
    tx.className = 'banner-text';
    tx.textContent = text;
    row.appendChild(ic);
    row.appendChild(tx);
    chatBanner.appendChild(row);
  }

  /** Kick off content download for the current page, then update chat context. */
  async function downloadPageForChat() {
    if (!existingLink) return;
    renderChatBanner(); // show "Fetching…" immediately

    try {
      // Try scripting extraction first (same as Save Content button)
      let text = null;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const clone = document.body.cloneNode(true);
            ['script', 'style', 'nav', 'footer', 'aside', 'header'].forEach(tag => {
              clone.querySelectorAll(tag).forEach(el => el.remove());
            });
            return (clone.innerText || clone.textContent || '').trim();
          },
        });
        if (result?.result?.length >= 20) text = result.result;
      } catch {}

      const res = await fetch(`${API_LINKS}/${existingLink.id}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(text ? { text } : {}),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();

      if (updated.contentStatus === 'parsed') {
        existingLink = updated;
        chatLinkId = updated.id;
      } else {
        // Pending — poll until parsed
        existingLink = updated;
        pollForContent();
      }
      renderChatBanner();
    } catch {
      appendSystemMessage('Could not download page content.');
    }
  }

  /** Poll every 3 s until contentStatus becomes 'parsed'. */
  function pollForContent() {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_LINKS}/${existingLink.id}`);
        if (!res.ok) return;
        const updated = await res.json();
        existingLink = updated;
        if (updated.contentStatus === 'parsed') {
          clearInterval(pollInterval);
          chatLinkId = updated.id;
          renderChatBanner();
        }
      } catch {}
    }, 3000);
  }

  /** Called when the Chat tab becomes active. */
  async function initChatTab() {
    chatPageUrl = null;
    chatLinkId  = null;
    chatSelectedText = null;

    // 1. Check for a pending context-menu selection
    const session = await chrome.storage.session.get('pendingChat');
    if (session.pendingChat && Date.now() - session.pendingChat.timestamp < 30_000) {
      chatSelectedText = session.pendingChat.selectedText || null;
      chatPageUrl      = session.pendingChat.url || null;
      await chrome.storage.session.remove('pendingChat');
    }

    // 2. Determine the current tab's URL (may differ from pendingChat.url)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) chatPageUrl = tab.url;

    // 3. If the page is already saved with parsed content, wire up linkId
    if (existingLink?.contentStatus === 'parsed') {
      chatLinkId = existingLink.id;
    }

    renderChatBanner();

    // Focus the input
    chatInput.focus();
  }

  /**
   * Minimal markdown → HTML renderer for chat bubbles.
   * Handles: **bold**, *italic*, `code`, ``` code blocks ```,
   * - / * bullet lists, numbered lists, and line breaks.
   */
  function renderMarkdown(text) {
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
      let inList = false;
      let listTag = '';
      let buf = '';

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
          if (trimmed === '') {
            buf += '<br>';
          } else {
            buf += inlineMarks(esc(line)) + '<br>';
          }
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
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
  }

  /** Append a message bubble to the chat history UI. */
  function appendMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `chat-msg chat-msg-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }

    wrap.appendChild(bubble);
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /** Append a muted system-level notice (not a chat turn). */
  function appendSystemMessage(text) {
    const el = document.createElement('p');
    el.className = 'chat-system-msg';
    el.textContent = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /** Show/hide the typing indicator. */
  function setLoading(on) {
    chatLoading = on;
    chatSendBtn.disabled = on;
    chatInput.disabled   = on;
    let indicator = document.getElementById('chat-typing');
    if (on && !indicator) {
      indicator = document.createElement('div');
      indicator.id = 'chat-typing';
      indicator.className = 'chat-typing';
      indicator.innerHTML = '<span></span><span></span><span></span>';
      chatMessages.appendChild(indicator);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else if (!on && indicator) {
      indicator.remove();
    }
  }

  /** Send the current input to the backend. */
  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text || chatLoading) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
    appendMessage('user', text);
    setLoading(true);

    try {
      const body = {
        message:      text,
        history:      chatHistory,
        pageUrl:      chatPageUrl       || undefined,
        linkId:       chatLinkId        || undefined,
        selectedText: chatSelectedText  || undefined,
        webSearch:    chatWebSearch     || undefined,
      };

      const res = await fetch(API_CHAT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { reply } = await res.json();

      chatHistory.push({ role: 'user',      content: text  });
      chatHistory.push({ role: 'assistant', content: reply });

      appendMessage('assistant', reply);
    } catch (err) {
      appendSystemMessage(err instanceof TypeError ? 'Server not reachable.' : 'Could not get a reply.');
    } finally {
      setLoading(false);
      chatInput.focus();
    }
  }

  // Wire up send button and Enter key
  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  });

  // If popup was opened via context menu, switch directly to Chat tab
  chrome.storage.session.get('pendingChat', (session) => {
    if (session.pendingChat && Date.now() - session.pendingChat.timestamp < 30_000) {
      // Simulate a click on the Chat tab
      document.querySelector('.tab[data-tab="chat"]')?.click();
    }
  });

  // ── Helpers ──────────────────────────────────────────────────
  function setContentStatus(status) {
    if (status === 'parsed') {
      saveContentBtn.hidden = true;
      contentStatusChip.hidden = false;
      contentStatusChip.className = 'content-status-chip status-saved';
      contentStatusChip.innerHTML = '<span class="content-status-chip-icon">✓</span> Content saved';
    } else if (status === 'pending') {
      saveContentBtn.hidden = true;
      contentStatusChip.hidden = false;
      contentStatusChip.className = 'content-status-chip status-pending';
      contentStatusChip.innerHTML = '<span class="content-status-chip-icon">⏳</span> Fetching content…';
    } else {
      saveContentBtn.hidden = false;
      contentStatusChip.hidden = true;
    }
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    statusEl.hidden = false;
  }
  function hideStatus() {
    statusEl.hidden = true;
    statusEl.className = 'status';
  }
  function truncate(str, max) {
    if (!str) return '';
    return str.length <= max ? str : str.slice(0, max - 1) + '…';
  }
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
});

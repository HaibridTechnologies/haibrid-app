'use strict';
const fs      = require('fs');
const crypto  = require('crypto');
const express = require('express');
const router  = express.Router();

const { fetchTitle } = require('../lib/http');
const { CONTENT_DIR, PDF_DIR } = require('../contentQueue');
const {
  readLinks, writeLinks, modifyLinks,
  readIndex, writeIndex, modifyIndex, updateIndex,
  findLink,
} = require('../lib/storage');
const { extractArxivId, fetchCitationCount } = require('../lib/semanticScholar');
const wrap = require('../lib/asyncHandler');

// NOTE: normaliseUrl is intentionally duplicated in packages/extension/popup.js
// because the extension runs in a browser context without access to Node modules.
// If you update the logic here, update popup.js to match.
/**
 * Strip tracking/session parameters from a URL, keeping only canonical form.
 * Currently handles YouTube watch URLs and youtu.be short URLs.
 *
 * @param {string} url
 * @returns {string}  Cleaned URL, or the original string if parsing fails
 */
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
  } catch (_) { /* malformed URL — return as-is */ }
  return url;
}

// ─── GET /api/links ───────────────────────────────────────────────────────────
// Query params:
//   ?q=<string>          full-text search across url, title, notes
//   ?project=<id>        filter to links belonging to a project (uses index)
//   ?unread=true         only unread links (used by Reading List)
//   ?unassigned=true     only read links with no project (used by Unassigned folder)
//   ?hasContent=true     only links that have saved content
router.get('/', (req, res) => {
  const { q, project, unread, unassigned, hasContent } = req.query;
  let links = readLinks();

  if (project) {
    const index = readIndex();
    const ids   = new Set(index[project] || []);
    links = links.filter(l => ids.has(l.id));
  }
  if (unassigned === 'true') {
    links = links.filter(l => l.read && (!l.projects || l.projects.length === 0));
  }
  if (unread === 'true') {
    links = links.filter(l => !l.read);
  }
  if (hasContent === 'true') {
    links = links.filter(l => l.contentStatus && l.contentStatus !== 'none');
  }
  if (q) {
    const query = q.toLowerCase();
    links = links.filter(l =>
      l.url.toLowerCase().includes(query) ||
      (l.title && l.title.toLowerCase().includes(query)) ||
      (l.notes && l.notes.toLowerCase().includes(query))
    );
  }
  res.json(links);
});

// ─── POST /api/links ──────────────────────────────────────────────────────────
// Body: { url, title?, notes?, projects? }
// If `title` is omitted the server fetches it from the page's <title> tag.
router.post('/', wrap(async (req, res) => {
  const { url: rawUrl, title, notes, projects } = req.body;
  if (!rawUrl) return res.status(400).json({ error: 'url is required' });

  const url           = normaliseUrl(rawUrl);
  const resolvedTitle = title || (await fetchTitle(url)) || url;

  const link = await modifyLinks(links => {
    const l = {
      id:        crypto.randomUUID(),
      url,
      title:     resolvedTitle,
      notes:     notes || '',
      read:      false,
      projects:  Array.isArray(projects) ? projects : [],
      createdAt: new Date().toISOString(),
    };
    links.unshift(l);
    return l;
  });

  if (link.projects.length > 0) {
    await modifyIndex(index => {
      updateIndex(index, link.id, [], link.projects);
    });
  }

  // Fire-and-forget citation count lookup for arXiv links
  const arxivId = extractArxivId(url);
  if (arxivId) {
    fetchCitationCount(arxivId).then(async count => {
      if (count === null) return;
      await modifyLinks(links => {
        const saved = links.find(l => l.id === link.id);
        if (!saved) return;
        saved.citationCount   = count;
        saved.citationCountAt = new Date().toISOString();
      });
    }).catch(() => {});
  }

  res.status(201).json(link);
}));

// ─── PATCH /api/links/:id ─────────────────────────────────────────────────────
// Update mutable fields: title and/or notes.
router.patch('/:id', findLink, wrap(async (req, res) => {
  const { title, notes } = req.body;
  const link = await modifyLinks(links => {
    const l = links.find(l => l.id === req.params.id);
    if (!l) return null;
    if (title !== undefined) l.title = title.trim() || l.title;
    if (notes !== undefined) l.notes = notes;
    return l;
  });
  if (!link) return res.status(404).json({ error: 'not found' });
  res.json(link);
}));

// ─── PATCH /api/links/:id/toggle ─────────────────────────────────────────────
router.patch('/:id/toggle', findLink, wrap(async (req, res) => {
  const link = await modifyLinks(links => {
    const l = links.find(l => l.id === req.params.id);
    if (!l) return null;
    l.read = !l.read;
    return l;
  });
  if (!link) return res.status(404).json({ error: 'not found' });
  res.json(link);
}));

// ─── PATCH /api/links/:id/projects ───────────────────────────────────────────
router.patch('/:id/projects', findLink, wrap(async (req, res) => {
  const { projects } = req.body;
  if (!Array.isArray(projects)) return res.status(400).json({ error: 'projects must be an array' });

  const result = await modifyLinks(links => {
    const l = links.find(l => l.id === req.params.id);
    if (!l) return null;
    const oldProjects = l.projects || [];
    l.projects = projects;
    return { link: l, oldProjects };
  });
  if (!result) return res.status(404).json({ error: 'not found' });

  await modifyIndex(index => {
    updateIndex(index, result.link.id, result.oldProjects, projects);
  });
  res.json(result.link);
}));

// ─── POST /api/links/:id/citations/refresh ───────────────────────────────────
router.post('/:id/citations/refresh', findLink, wrap(async (req, res) => {
  const arxivId = extractArxivId(req.link.url);
  if (!arxivId) return res.status(400).json({ error: 'not an arXiv link' });

  const count = await fetchCitationCount(arxivId).catch(() => null);
  if (count === null) return res.status(502).json({ error: 'could not reach Semantic Scholar' });

  const link = await modifyLinks(links => {
    const l = links.find(l => l.id === req.params.id);
    if (!l) return null;
    l.citationCount   = count;
    l.citationCountAt = new Date().toISOString();
    return l;
  });
  if (!link) return res.status(404).json({ error: 'not found' });
  res.json(link);
}));

// ─── POST /api/links/dwell ────────────────────────────────────────────────────
// Called by the extension background worker whenever a saved page is visited.
// Accumulates dwell time on the link so it can be ranked by engagement.
// Body: { url, dwellSeconds }
// No-op (200 ok:false) if the URL is not a saved link — caller can ignore.
router.post('/dwell', wrap(async (req, res) => {
  const { url: rawUrl, dwellSeconds } = req.body;
  if (!rawUrl || !Number.isFinite(Number(dwellSeconds)) || dwellSeconds <= 0) {
    return res.status(400).json({ error: 'url and positive dwellSeconds are required' });
  }

  const url = normaliseUrl(rawUrl);
  const result = await modifyLinks(links => {
    const link = links.find(l => l.url === url);
    if (!link) return null;
    link.totalDwellSeconds = (link.totalDwellSeconds || 0) + Math.round(dwellSeconds);
    return { ok: true, totalDwellSeconds: link.totalDwellSeconds };
  });
  res.json(result || { ok: false });
}));

// ─── GET /api/links/export ───────────────────────────────────────────────────
router.get('/export', (req, res) => {
  const links    = readLinks();
  const filename = `haibrid-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.json({ version: 1, exportedAt: new Date().toISOString(), links });
});

// ─── POST /api/links/import ──────────────────────────────────────────────────
// Body: { links: Link[] }  (the shape produced by /export)
// For each incoming link:
//   - New URL → add as a new link (with any provided project tags)
//   - Existing URL + project tags → merge the project tags onto the existing link
//   - Existing URL, no project tags → skip
// Returns { added, tagged, skipped } counts.
router.post('/import', wrap(async (req, res) => {
  const incoming = req.body?.links;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'links array required' });

  let added = 0, tagged = 0, skipped = 0;
  const indexOps = [];  // { linkId, oldProjects, newProjects }

  await modifyLinks(links => {
    const urlToLink   = new Map(links.map(l => [l.url, l]));
    const seenInBatch = new Set();
    const toAdd = [];

    for (const item of incoming) {
      if (!item.url) { skipped++; continue; }
      const url         = normaliseUrl(item.url);
      const newProjects = Array.isArray(item.projects) ? item.projects : [];

      if (urlToLink.has(url)) {
        if (newProjects.length === 0) { skipped++; continue; }
        const saved  = urlToLink.get(url);
        const before = saved.projects || [];
        const merged = [...new Set([...before, ...newProjects])];
        if (merged.length === before.length) { skipped++; continue; }
        indexOps.push({ linkId: saved.id, oldProjects: before, newProjects: merged });
        saved.projects = merged;
        tagged++;
      } else if (!seenInBatch.has(url)) {
        seenInBatch.add(url);
        const newLink = {
          id:        crypto.randomUUID(),
          url,
          title:     item.title || url,
          notes:     item.notes || '',
          read:      !!item.read,
          projects:  newProjects,
          createdAt: item.createdAt || new Date().toISOString(),
          ...(item.citationCount != null ? { citationCount: item.citationCount, citationCountAt: item.citationCountAt } : {}),
        };
        toAdd.push(newLink);
        if (newProjects.length > 0) indexOps.push({ linkId: newLink.id, oldProjects: [], newProjects });
        added++;
      } else {
        skipped++;
      }
    }

    if (toAdd.length > 0) links.unshift(...toAdd.reverse());
  });

  if (indexOps.length > 0) {
    await modifyIndex(index => {
      for (const { linkId, oldProjects, newProjects } of indexOps) {
        updateIndex(index, linkId, oldProjects, newProjects);
      }
    });
  }

  res.json({ added, tagged, skipped });
}));

// ─── POST /api/links/:id/comments ────────────────────────────────────────────
router.post('/:id/comments', findLink, wrap(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const link = await modifyLinks(links => {
    const l = links.find(l => l.id === req.params.id);
    if (!l) return null;
    if (!Array.isArray(l.comments)) l.comments = [];
    l.comments.push({ id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() });
    return l;
  });
  if (!link) return res.status(404).json({ error: 'not found' });
  res.json(link);
}));

// ─── DELETE /api/links/:id/comments/:commentId ───────────────────────────────
router.delete('/:id/comments/:commentId', findLink, wrap(async (req, res) => {
  const found = await modifyLinks(links => {
    const link = links.find(l => l.id === req.params.id);
    if (!link) return 'link-missing';
    const before = (link.comments || []).length;
    link.comments = (link.comments || []).filter(c => c.id !== req.params.commentId);
    if (link.comments.length === before) return 'comment-missing';
    return 'ok';
  });
  if (found === 'link-missing') return res.status(404).json({ error: 'not found' });
  if (found === 'comment-missing') return res.status(404).json({ error: 'comment not found' });
  res.status(204).end();
}));

// ─── GET /api/links/:id ──────────────────────────────────────────────────────
router.get('/:id', findLink, (req, res) => {
  res.json(req.link);
});

// ─── DELETE /api/links/:id ────────────────────────────────────────────────────
router.delete('/:id', findLink, wrap(async (req, res) => {
  const removed = await modifyLinks(links => {
    const idx = links.findIndex(l => l.id === req.params.id);
    if (idx === -1) return null;
    return links.splice(idx, 1)[0];
  });
  if (!removed) return res.status(404).json({ error: 'not found' });

  if (removed.projects && removed.projects.length > 0) {
    await modifyIndex(index => {
      updateIndex(index, removed.id, removed.projects, []);
    });
  }

  const p = require('path');
  const contentFile = p.join(CONTENT_DIR, `${removed.id}.txt`);
  const pdfFile     = p.join(PDF_DIR,     `${removed.id}.pdf`);
  if (fs.existsSync(contentFile)) fs.unlinkSync(contentFile);
  if (fs.existsSync(pdfFile))     fs.unlinkSync(pdfFile);

  res.status(204).end();
}));

module.exports = router;
module.exports.normaliseUrl = normaliseUrl;

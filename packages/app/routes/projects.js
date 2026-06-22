'use strict';
const crypto       = require('crypto');
const express      = require('express');
const router       = express.Router();
const contentQueue = require('../contentQueue');
const semanticScholar = require('../lib/semanticScholar');

const {
  readLinks, writeLinks, modifyLinks,
  readIndex, writeIndex, modifyIndex,
  readProjects, writeProjects, modifyProjects,
} = require('../lib/storage');
const wrap = require('../lib/asyncHandler');

// ─── GET /api/projects ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const projects = readProjects();
  const index    = readIndex();
  res.json(projects.map(p => ({ ...p, linkCount: (index[p.id] || []).length })));
});

// ─── POST /api/projects ───────────────────────────────────────────────────────
router.post('/', wrap(async (req, res) => {
  const { name, description, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const project = await modifyProjects(projects => {
    const p = {
      id:          crypto.randomUUID(),
      name:        name.trim(),
      description: description || '',
      color:       color || '#2563eb',
      createdAt:   new Date().toISOString(),
    };
    projects.unshift(p);
    return p;
  });
  res.status(201).json({ ...project, linkCount: 0 });
}));

// ─── PATCH /api/projects/:id ──────────────────────────────────────────────────
router.patch('/:id', wrap(async (req, res) => {
  const { name, description, color } = req.body;
  const project = await modifyProjects(projects => {
    const p = projects.find(p => p.id === req.params.id);
    if (!p) return null;
    if (name        !== undefined) p.name        = name.trim();
    if (description !== undefined) p.description = description;
    if (color       !== undefined) p.color       = color;
    return p;
  });
  if (!project) return res.status(404).json({ error: 'not found' });

  const index = readIndex();
  res.json({ ...project, linkCount: (index[project.id] || []).length });
}));

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
// Cascade: removes the project from the index and from every link's projects array.
router.delete('/:id', wrap(async (req, res) => {
  const pid = req.params.id;
  const found = await modifyProjects(projects => {
    const idx = projects.findIndex(p => p.id === pid);
    if (idx === -1) return false;
    projects.splice(idx, 1);
    return true;
  });
  if (!found) return res.status(404).json({ error: 'not found' });

  await modifyIndex(index => {
    delete index[pid];
  });

  await modifyLinks(links => {
    for (const link of links) {
      if (link.projects && link.projects.includes(pid)) {
        link.projects = link.projects.filter(id => id !== pid);
      }
    }
  });

  res.status(204).end();
}));

// ─── POST /api/projects/:id/suggest-questions ────────────────────────────────
// Asks the model to generate 5 specific questions based on the project's
// loaded source abstracts/summaries. Used by the Research tab "Generate" button.
router.post('/:id/suggest-questions', wrap(async (req, res) => {
  const Anthropic = require('@anthropic-ai/sdk');
  const { chat: chatPrompt } = require('../lib/prompts');

  const index = readIndex();
  const ids   = index[req.params.id] || [];
  const links = readLinks().filter(l => ids.includes(l.id) && l.contentStatus === 'parsed');

  if (links.length === 0) {
    return res.json({ suggestions: [] });
  }

  const projects = readProjects();
  const project  = projects.find(p => p.id === req.params.id);

  // Build a compact context: title + abstract/summary for each source
  const context = links.map((l, i) => {
    const blurb = l.abstract || l.summary || '(no abstract available)';
    return `Source ${i + 1}: ${l.title || l.url}\n${blurb}`;
  }).join('\n\n');

  const prompt = `You are helping a researcher explore a collection of sources saved in a project called "${project?.name || 'Research'}".

Here are the sources:

${context}

Generate exactly 5 specific, insightful questions a researcher would want to ask about these sources. The questions should:
- Be grounded in the actual content described above (mention specific concepts, methods, or findings)
- Vary in scope (some cross-source comparisons, some deep dives into a single source)
- Be concise (one sentence each)

Respond with ONLY a JSON array of 5 strings. No explanation, no markdown, no preamble.
Example: ["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?"]`;

  try {
    let client = new Anthropic();
    if (process.env.LANGSMITH_TRACING === 'true') {
      try { const { wrapSDK } = require('langsmith/wrappers'); client = wrapSDK(client); } catch {}
    }
    const response = await client.messages.create({
      model:      req.body.model || chatPrompt.model,
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw  = response.content.find(b => b.type === 'text')?.text?.trim() || '[]';
    const suggestions = JSON.parse(raw);
    res.json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch (err) {
    console.error('[suggest-questions]', err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
}));

// ─── GET /api/projects/:id/content-status ────────────────────────────────────
// Returns a breakdown of content loading progress for all links in a project.
router.get('/:id/content-status', (req, res) => {
  const index = readIndex();
  const ids   = index[req.params.id] || [];
  const links = readLinks().filter(l => ids.includes(l.id));

  res.json({
    total:   links.length,
    parsed:  links.filter(l => l.contentStatus === 'parsed').length,
    pending: links.filter(l => l.contentStatus === 'pending').length,
    failed:  links.filter(l => l.contentStatus === 'failed').length,
  });
});

// ─── POST /api/projects/:id/load-content ─────────────────────────────────────
// Enqueues content fetching for all unloaded links in the project, and
// kicks off citation refresh (fire-and-forget) for any arXiv links.
router.post('/:id/load-content', wrap(async (req, res) => {
  const index = readIndex();
  const ids   = index[req.params.id] || [];
  const links = readLinks().filter(l => ids.includes(l.id));

  const unloaded = links.filter(l => l.contentStatus !== 'parsed' && l.contentStatus !== 'pending');
  const arxiv    = links.filter(l => /arxiv\.org/i.test(l.url));

  // Enqueue content fetching for each unloaded link
  for (const link of unloaded) {
    link.contentStatus = 'pending';
    contentQueue.enqueue(link.id);
  }
  if (unloaded.length > 0) {
    const unloadedIds = new Set(unloaded.map(l => l.id));
    await modifyLinks(links => {
      for (const l of links) {
        if (unloadedIds.has(l.id)) l.contentStatus = 'pending';
      }
    });
  }

  // Refresh citations for arXiv links (fire-and-forget — non-blocking)
  for (const link of arxiv) {
    const arxivId = semanticScholar.extractArxivId(link.url);
    if (!arxivId) continue;
    semanticScholar.fetchCitationCount(arxivId)
      .then(async count => {
        if (count == null) return;
        await modifyLinks(links => {
          const l = links.find(x => x.id === link.id);
          if (!l) return;
          l.citationCount   = count;
          l.citationCountAt = new Date().toISOString();
        });
      })
      .catch(() => {});
  }

  res.json({
    total:    links.length,
    enqueued: unloaded.length,
    arxiv:    arxiv.length,
  });
}));

module.exports = router;

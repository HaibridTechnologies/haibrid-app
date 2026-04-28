'use strict';
const express = require('express');
const router  = express.Router();
const logger  = require('../lib/logger');
const {
  readVisits, writeVisits,
  readVisitsPending, writeVisitsPending,
  readVisitFilters, writeVisitFilters,
} = require('../lib/storage');
const { evaluateVisits } = require('../lib/evaluateVisits');
const { visits: visitsConfig } = require('../lib/config');

const MAX_AGE_DAYS = visitsConfig.maxAgeDays;

function pruneOldVisits(visits) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return visits.filter(v => new Date(v.visitedAt).getTime() > cutoff);
}

/**
 * Deduplicate visits by URL — keep the most recent entry per URL,
 * accumulating dwell time across all duplicates.
 * Run during Parse History so the cost is paid once, not on every write.
 */
function deduplicateVisits(visits) {
  const seen = new Map(); // url → index in result
  const result = [];
  for (const v of visits) {
    if (seen.has(v.url)) {
      const existing = result[seen.get(v.url)];
      existing.dwellSeconds += v.dwellSeconds;
      // Keep the most recent timestamp and best title
      if (new Date(v.visitedAt) > new Date(existing.visitedAt)) {
        existing.visitedAt = v.visitedAt;
        if (v.title) existing.title = v.title;
      }
    } else {
      seen.set(v.url, result.length);
      result.push({ ...v });
    }
  }
  return result;
}

// ─── GET /api/visits ──────────────────────────────────────────────────────────
// Query params:
//   ?days=N      only return visits from the last N days (default: 30)
//   ?domain=x    filter to a specific domain
//   ?q=x         search title/url
router.get('/', (req, res) => {
  const { days = 30, domain, q } = req.query;
  const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;

  let visits = readVisits().filter(v => new Date(v.visitedAt).getTime() > cutoff);

  if (domain) visits = visits.filter(v => v.domain === domain);
  if (q) {
    const query = q.toLowerCase();
    visits = visits.filter(v =>
      v.url.toLowerCase().includes(query) ||
      (v.title && v.title.toLowerCase().includes(query))
    );
  }

  // Return most recent first
  visits.sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
  res.json(visits);
});

// ─── POST /api/visits ─────────────────────────────────────────────────────────
// Called by the extension background worker when a meaningful visit completes.
// Body: { url, title, domain, dwellSeconds, visitedAt }
router.post('/', (req, res) => {
  const { url, title, domain, dwellSeconds, visitedAt } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let visits = readVisits();

  visits.unshift({
    id:           Date.now().toString(),
    url,
    title:        title || '',
    domain:       domain || '',
    dwellSeconds: Number(dwellSeconds) || 0,
    visitedAt:    visitedAt || new Date().toISOString(),
  });

  writeVisits(visits);
  res.status(201).json({ ok: true });
});

// ─── DELETE /api/visits/:id ───────────────────────────────────────────────────
// Delete a single visit by id.
router.delete('/:id', (req, res) => {
  const visits = readVisits().filter(v => v.id !== req.params.id);
  writeVisits(visits);
  res.status(204).end();
});

// ─── DELETE /api/visits ───────────────────────────────────────────────────────
// Clear all visit history.
router.delete('/', (req, res) => {
  writeVisits([]);
  res.status(204).end();
});

// ─── GET /api/visits/pending ──────────────────────────────────────────────────
router.get('/pending', (req, res) => {
  const pending = readVisitsPending()
  pending.sort((a, b) => new Date(b.queuedAt) - new Date(a.queuedAt))
  res.json(pending)
})

// ─── POST /api/visits/pending ─────────────────────────────────────────────────
// Called by the extension for visits not matching the allow or block list.
router.post('/pending', (req, res) => {
  const { url, title, domain, dwellSeconds, visitedAt } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const pending = readVisitsPending();

  // Avoid duplicating the same URL if it's already in the queue
  if (pending.some(v => v.url === url)) return res.status(200).json({ ok: true, duplicate: true });

  pending.unshift({
    id:          Date.now().toString(),
    url,
    title:       title || '',
    domain:      domain || '',
    dwellSeconds: Number(dwellSeconds) || 0,
    visitedAt:   visitedAt || new Date().toISOString(),
    queuedAt:    new Date().toISOString(),
  });

  writeVisitsPending(pending);
  res.status(201).json({ ok: true });
});

// ─── POST /api/visits/pending/evaluate ───────────────────────────────────────
// Run LLM evaluation on all pending visits. Kept items move to history.
router.post('/pending/evaluate', async (req, res) => {
  const pending = readVisitsPending();
  logger.log(`\n[POST /pending/evaluate] Parse History triggered — ${pending.length} pending visit(s)`);
  if (!pending.length) {
    logger.log(`[POST /pending/evaluate] Nothing to evaluate, returning early`);
    return res.json({ kept: 0, dropped: 0, results: [] });
  }

  const filters = readVisitFilters();
  const prompt  = filters.evaluationPrompt || '';
  logger.log(`[POST /pending/evaluate] Evaluation prompt: "${prompt || '(default)'}"`)

  let results;
  try {
    results = await evaluateVisits(pending, prompt);
  } catch (err) {
    logger.error(`[POST /pending/evaluate] evaluateVisits threw:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  // Build a lookup by id
  const byId = Object.fromEntries(results.map(r => [r.id, r]));

  const kept    = [];
  const dropped = [];

  for (const visit of pending) {
    const decision = byId[visit.id];
    if (decision?.keep !== false) {
      kept.push(visit);
    } else {
      dropped.push(visit.id);
    }
  }

  // Move kept visits to confirmed history, then prune and deduplicate in one pass
  {
    let visits = readVisits();
    visits = pruneOldVisits([...kept, ...visits]);
    visits = deduplicateVisits(visits);
    writeVisits(visits);
  }

  // Clear the pending queue
  writeVisitsPending([]);

  logger.log(`[POST /pending/evaluate] Complete — kept: ${kept.length}, dropped: ${dropped.length}`);
  res.json({ kept: kept.length, dropped: dropped.length, results });
});

// ─── DELETE /api/visits/pending ───────────────────────────────────────────────
// Discard the entire pending queue without evaluating.
router.delete('/pending', (req, res) => {
  writeVisitsPending([]);
  res.status(204).end();
});

// ─── GET /api/visits/filters ──────────────────────────────────────────────────
router.get('/filters', (req, res) => {
  res.json(readVisitFilters());
});

// ─── PUT /api/visits/filters ──────────────────────────────────────────────────
// Body: { blockList, allowList, minDwellSeconds, evaluationPrompt }
router.put('/filters', (req, res) => {
  const { blockList, allowList, minDwellSeconds, evaluationPrompt } = req.body;

  // Normalise an entry: if someone pastes a full URL, extract just the hostname.
  const normalise = (s) => {
    const trimmed = s.trim().toLowerCase();
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      // Keep the path if the user specified one (strip trailing slash)
      const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
      return url.hostname + path;
    } catch {
      return trimmed;
    }
  };

  const filters = {
    blockList:        Array.isArray(blockList)  ? blockList.map(normalise).filter(Boolean)  : [],
    allowList:        Array.isArray(allowList)  ? allowList.map(normalise).filter(Boolean)  : [],
    minDwellSeconds:  Number.isFinite(Number(minDwellSeconds)) ? Number(minDwellSeconds) : visitsConfig.minDwellSeconds,
    evaluationPrompt: typeof evaluationPrompt === 'string' ? evaluationPrompt : '',
  };
  writeVisitFilters(filters);
  res.json(filters);
});

module.exports = router;

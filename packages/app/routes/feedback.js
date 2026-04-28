'use strict';

const express = require('express');
const router  = express.Router();
const { readFeedback, writeFeedback } = require('../lib/storage');

/**
 * GET /api/feedback?url=<url>
 * Returns all feedback entries for a given URL, newest first.
 */
router.get('/', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });
  const all = readFeedback();
  res.json(all[url] || []);
});

/**
 * POST /api/feedback
 * Save one or more feedback entries.
 *
 * Body: Array of { url, comment, decision, reason }
 * Only entries with a non-empty comment are persisted.
 * Returns the full updated feedback map for all affected URLs.
 */
router.post('/', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'body must be an array' });

  const all = readFeedback();
  const now = new Date().toISOString();

  for (const { url, comment, decision, reason } of items) {
    if (!url || !comment?.trim()) continue;
    if (!all[url]) all[url] = [];
    all[url].unshift({
      id:        Date.now().toString() + Math.random().toString(36).slice(2, 6),
      comment:   comment.trim(),
      decision,
      reason,
      createdAt: now,
    });
  }

  writeFeedback(all);
  res.status(201).json({ ok: true });
});

module.exports = router;

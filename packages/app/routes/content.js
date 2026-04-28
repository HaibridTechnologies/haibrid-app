'use strict';
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const router  = express.Router();

const contentQueue              = require('../contentQueue');
const { readLinks, writeLinks } = require('../lib/storage');

// Share the content directory path with the queue so files land in one place
const { content: contentConfig } = require('../lib/config');
const CONTENT_DIR = contentQueue.CONTENT_DIR;
const MAX_CHARS   = contentConfig.maxChars;

// ─── POST /api/links/:id/content ─────────────────────────────────────────────
// Two modes depending on whether the caller supplies `text`:
//
//   • text provided (≥ 20 chars) — extension extracted it from the DOM;
//     persist directly and mark as parsed without a server fetch.
//
//   • no text — server must fetch the page itself; mark as pending
//     and enqueue the link for background processing.
router.post('/:id/content', (req, res) => {
  const links = readLinks();
  const link  = links.find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'not found' });

  const { text } = req.body;

  if (text && text.trim().length >= 20) {
    // Extension-supplied text: write directly and skip the fetch queue
    const truncated = text.length > MAX_CHARS;
    fs.writeFileSync(
      path.join(CONTENT_DIR, `${link.id}.txt`),
      truncated ? text.slice(0, MAX_CHARS) : text.trim(),
      'utf8'
    );
    link.contentStatus    = 'parsed';
    link.contentParsedAt  = new Date().toISOString();
    link.contentTruncated = truncated;
    link.contentError     = null;
    writeLinks(links);
    return res.json(link);
  }

  // No usable text — hand off to the content queue for a server-side fetch
  link.contentStatus = 'pending';
  link.contentError  = null;
  writeLinks(links);
  contentQueue.enqueue(link.id);
  res.json(link);
});

// ─── GET /api/links/:id/content ───────────────────────────────────────────────
// Reads the saved plain-text file and returns it alongside the truncation flag.
router.get('/:id/content', (req, res) => {
  const links = readLinks();
  const link  = links.find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'not found' });

  const filePath = path.join(CONTENT_DIR, `${link.id}.txt`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'content not found' });

  res.json({ text: fs.readFileSync(filePath, 'utf8'), truncated: link.contentTruncated || false });
});

// ─── DELETE /api/links/:id/content ───────────────────────────────────────────
// Removes the saved text file and resets all content-related fields on the link.
router.delete('/:id/content', (req, res) => {
  const links = readLinks();
  const link  = links.find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'not found' });

  const filePath = path.join(CONTENT_DIR, `${link.id}.txt`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  link.contentStatus    = null;
  link.contentParsedAt  = null;
  link.contentTruncated = false;
  link.contentError     = null;
  writeLinks(links);
  res.status(204).end();
});

module.exports = router;

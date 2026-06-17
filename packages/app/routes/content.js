'use strict';
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const router  = express.Router();

const contentQueue                                    = require('../contentQueue');
const { readLinks, writeLinks, modifyLinks, findLink } = require('../lib/storage');
const wrap = require('../lib/asyncHandler');

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
router.post('/:id/content', findLink, wrap(async (req, res) => {
  const { text } = req.body;
  const linkId = req.params.id;

  if (text && text.trim().length >= 20) {
    const truncated = text.length > MAX_CHARS;
    fs.writeFileSync(
      path.join(CONTENT_DIR, `${linkId}.txt`),
      truncated ? text.slice(0, MAX_CHARS) : text.trim(),
      'utf8'
    );
    const link = await modifyLinks(links => {
      const l = links.find(l => l.id === linkId);
      if (!l) return null;
      l.contentStatus    = 'parsed';
      l.contentParsedAt  = new Date().toISOString();
      l.contentTruncated = truncated;
      l.contentError     = null;
      return l;
    });
    if (!link) return res.status(404).json({ error: 'not found' });
    return res.json(link);
  }

  const link = await modifyLinks(links => {
    const l = links.find(l => l.id === linkId);
    if (!l) return null;
    l.contentStatus = 'pending';
    l.contentError  = null;
    return l;
  });
  if (!link) return res.status(404).json({ error: 'not found' });
  contentQueue.enqueue(linkId);
  res.json(link);
}));

// ─── GET /api/links/:id/content ───────────────────────────────────────────────
// Reads the saved plain-text file and returns it alongside the truncation flag.
router.get('/:id/content', findLink, (req, res) => {
  const { link } = req;

  const filePath = path.join(CONTENT_DIR, `${link.id}.txt`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'content not found' });

  res.json({ text: fs.readFileSync(filePath, 'utf8'), truncated: link.contentTruncated || false });
});

// ─── DELETE /api/links/:id/content ───────────────────────────────────────────
// Removes the saved text file and resets all content-related fields on the link.
router.delete('/:id/content', findLink, wrap(async (req, res) => {
  const linkId = req.params.id;
  const filePath = path.join(CONTENT_DIR, `${linkId}.txt`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await modifyLinks(links => {
    const l = links.find(l => l.id === linkId);
    if (!l) return;
    l.contentStatus    = null;
    l.contentParsedAt  = null;
    l.contentTruncated = false;
    l.contentError     = null;
  });
  res.status(204).end();
}));

module.exports = router;

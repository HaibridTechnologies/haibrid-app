'use strict';
const fs   = require('fs');
const path = require('path');
const { fetchHtml }             = require('./lib/http');
const { readLinks, writeLinks } = require('./lib/storage');
const htmlToText                = require('./lib/htmlToText');
const { getHandler }            = require('./lib/siteHandlers');
const { summarize }             = require('./lib/summarize');
const { downloadPdf, resolvePdfUrl } = require('./lib/downloadPdf');

const { content: contentConfig } = require('./lib/config');
const CONTENT_DIR = path.join(__dirname, 'content');
const PDF_DIR     = path.join(__dirname, 'pdfs');
const MAX_CHARS   = contentConfig.maxChars;

// Ensure storage directories exist at module load time
if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR);
if (!fs.existsSync(PDF_DIR))     fs.mkdirSync(PDF_DIR);

// ─── In-process queue ─────────────────────────────────────────────────────────
// A simple array-based FIFO queue processed one item at a time.
// Because Node.js is single-threaded, no mutex is needed — `processing`
// is sufficient to prevent concurrent runs.
let queue      = [];
let processing = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Apply `patch` to the link with `linkId` and persist to disk.
 * Re-reads links.json on every call so concurrent operations (e.g. a user
 * updating a link while the queue runs) are not overwritten.
 *
 * @param {string} linkId
 * @param {Object} patch  - Fields to merge into the link object
 * @returns {Object|null} - The updated link, or null if the id was not found
 */
function setLinkContent(linkId, patch) {
  const links = readLinks();
  const link  = links.find(l => l.id === linkId);
  if (!link) return null;
  Object.assign(link, patch);
  writeLinks(links);
  return link;
}

// ─── Processing ───────────────────────────────────────────────────────────────

/**
 * Fetch, parse, and persist the plain-text content for a single link.
 * Updates contentStatus to 'parsed' on success or 'failed' on error.
 *
 * @param {string} linkId
 */
async function processLink(linkId) {
  const links = readLinks();
  const link  = links.find(l => l.id === linkId);
  if (!link) return; // link was deleted while queued — skip silently

  // Mark as pending so the UI can show a spinner immediately
  setLinkContent(linkId, { contentStatus: 'pending', contentError: null });

  try {
    let text;
    let abstract = null;
    const handler = getHandler(link.url);

    if (handler) {
      // Site-specific parser (arXiv, YouTube, …) — returns { text, abstract? }
      const result = await handler(link.url);
      text     = result.text;
      abstract = result.abstract ?? null;
    } else {
      // Generic fallback: fetch HTML and strip tags
      const html = await fetchHtml(link.url);
      if (!html) throw new Error('Failed to fetch page');
      text = htmlToText(html);
    }

    if (!text || text.length < 20) throw new Error('No readable content found');

    const truncated = text.length > MAX_CHARS;
    fs.writeFileSync(
      path.join(CONTENT_DIR, `${linkId}.txt`),
      truncated ? text.slice(0, MAX_CHARS) : text,
      'utf8'
    );

    // ── Download PDF if the URL resolves to one ───────────────────────────────
    // Non-fatal: text content is already saved; a missing PDF is acceptable.
    let pdfFile = null;
    try {
      const pdfUrl = await resolvePdfUrl(link.url);
      if (pdfUrl) {
        const destPath = path.join(PDF_DIR, `${linkId}.pdf`);
        await downloadPdf(pdfUrl, destPath);
        pdfFile = `pdfs/${linkId}.pdf`;
        console.log(`[contentQueue] PDF saved for ${linkId}`);
      }
    } catch (pdfErr) {
      console.warn(`[contentQueue] PDF download failed for ${linkId}:`, pdfErr.message);
    }

    // ── Generate AI summary ───────────────────────────────────────────────────
    // Runs after content is saved; failure is non-fatal.
    let summary = null;
    try {
      summary = await summarize(truncated ? text.slice(0, MAX_CHARS) : text);
    } catch (summaryErr) {
      console.warn(`[contentQueue] summary failed for ${linkId}:`, summaryErr.message);
    }

    setLinkContent(linkId, {
      contentStatus:    'parsed',
      contentParsedAt:  new Date().toISOString(),
      contentTruncated: truncated,
      contentError:     null,
      abstract,
      summary,
      pdfFile,
    });
  } catch (err) {
    setLinkContent(linkId, {
      contentStatus:    'failed',
      contentParsedAt:  null,
      contentTruncated: false,
      contentError:     err.message,
    });
  }
}

/**
 * Drain the queue sequentially.
 * A guard prevents a second invocation from running while one is active.
 */
async function runQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  while (queue.length > 0) {
    const id = queue.shift();
    await processLink(id); // process one at a time to avoid hammering servers
  }
  processing = false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a link to the processing queue (no-op if already queued).
 * Starts the queue runner immediately if it is not already running.
 *
 * @param {string} linkId
 */
function enqueue(linkId) {
  if (!queue.includes(linkId)) {
    queue.push(linkId);
    runQueue(); // fire-and-forget — errors are caught inside runQueue
  }
}

/** @returns {string[]}  IDs currently waiting to be processed */
function getQueue() { return [...queue]; }

/** @returns {boolean}  True while a link is actively being fetched/parsed */
function isProcessing() { return processing; }

/**
 * Audit all links and re-queue any that need (re)processing:
 *
 *   • 'pending'  — server was restarted mid-fetch; resume the job
 *   • 'parsed'   — status says done but the content file is missing on disk;
 *                  reset to pending and re-queue
 *
 * Returns a summary of what was re-queued, suitable for an API response.
 *
 * @returns {{ requeued: string[], total: number }}
 */
function reconcile() {
  const links    = readLinks();
  const requeued = [];

  for (const link of links) {
    if (!link.contentStatus || link.contentStatus === 'failed') continue;

    if (link.contentStatus === 'pending') {
      // Stuck from a previous run — just re-enqueue
      enqueue(link.id);
      requeued.push(link.id);
      continue;
    }

    if (link.contentStatus === 'parsed') {
      const filePath = path.join(CONTENT_DIR, `${link.id}.txt`);
      if (!fs.existsSync(filePath)) {
        // File missing — reset status and re-queue
        link.contentStatus   = 'pending';
        link.contentParsedAt = null;
        link.contentError    = null;
        enqueue(link.id);
        requeued.push(link.id);
      }
    }
  }

  // Persist any status resets in one write
  if (requeued.length > 0) writeLinks(links);

  console.log(`[reconcile] checked ${links.length} links, re-queued ${requeued.length}`);
  return { requeued, total: links.length };
}

module.exports = { enqueue, getQueue, isProcessing, reconcile, CONTENT_DIR, PDF_DIR };

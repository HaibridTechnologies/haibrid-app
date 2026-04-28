'use strict';

const fs    = require('fs');
const https = require('https');
const http  = require('http');
const path  = require('path');

/**
 * Download a PDF from `url` and write it to `destPath`.
 * Follows up to 5 redirects. Rejects if the final Content-Type is not
 * application/pdf (guards against accidentally saving HTML error pages).
 *
 * @param {string} url
 * @param {string} destPath  - Absolute path to write the file to
 * @param {{ timeoutMs?: number, maxHops?: number }} opts
 * @returns {Promise<void>}  Resolves when the file is fully written
 */
function downloadPdf(url, destPath, { timeoutMs = 30_000, maxHops = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl, hops) => {
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinksApp/1.0)' },
      }, res => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (hops <= 0) return reject(new Error('Too many redirects'));
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, currentUrl).href;
          res.resume();
          return attempt(next, hops - 1);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
        }

        const ct = (res.headers['content-type'] || '').toLowerCase();
        if (!ct.includes('application/pdf') && !ct.includes('application/octet-stream')) {
          res.resume();
          return reject(new Error(`Unexpected Content-Type: ${ct}`));
        }

        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
        res.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
      });

      req.on('error', reject);
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('PDF download timed out')); });
    };

    attempt(url, maxHops);
  });
}

/**
 * Determine whether a URL likely points to a PDF, either by URL pattern
 * or by sending a HEAD request to inspect the Content-Type.
 *
 * @param {string} url
 * @returns {Promise<string|null>}  The direct PDF URL if it's a PDF, else null
 */
async function resolvePdfUrl(url) {
  // ── Pattern-based detection (fast, no network) ──────────────────────────────
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');

    // arXiv: normalise any variant to the canonical PDF URL
    const arxivMatch = url.match(/arxiv\.org\/(?:pdf|abs|html)\/(\d{4}\.\d+)/i);
    if (arxivMatch) return `https://arxiv.org/pdf/${arxivMatch[1]}`;

    // Generic: URL path ends with .pdf
    if (u.pathname.toLowerCase().endsWith('.pdf')) return url;
  } catch (_) {}

  // ── HEAD request for ambiguous URLs ─────────────────────────────────────────
  const ct = await headContentType(url);
  if (ct && ct.includes('application/pdf')) return url;

  return null;
}

/**
 * Send a HEAD request and return the Content-Type header value, or null.
 *
 * @param {string} url
 * @returns {Promise<string|null>}
 */
function headContentType(url, hops = 5) {
  return new Promise(resolve => {
    try {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.request(url, { method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinksApp/1.0)' },
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops > 0) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          return headContentType(next, hops - 1).then(resolve);
        }
        resolve(res.headers['content-type'] || null);
        res.resume();
      });
      req.on('error', () => resolve(null));
      req.setTimeout(8_000, () => { req.destroy(); resolve(null); });
      req.end();
    } catch (_) { resolve(null); }
  });
}

module.exports = { downloadPdf, resolvePdfUrl };

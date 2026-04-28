'use strict';
const https = require('https');
const http  = require('http');

const UA = 'Mozilla/5.0 (compatible; LinksApp/1.0)';

/**
 * Fetch the body of a URL as a UTF-8 string, following redirects.
 *
 * @param {string} url
 * @param {{
 *   timeoutMs?: number   - hard deadline in ms (default 10 s)
 *   maxHops?:   number   - maximum redirects to follow (default 5)
 *   maxBytes?:  number   - stop downloading after this many bytes (default 600 KB)
 *   stopEarly?: (body: string) => boolean  - abort once this returns true
 *   textOnly?:  boolean  - return null if Content-Type is not text/* or xhtml
 * }} opts
 * @returns {Promise<string|null>}  null on timeout, network error, or non-text content
 */
function fetchUrl(url, {
  timeoutMs = 10_000,
  maxHops   = 5,
  maxBytes  = 600_000,
  stopEarly = null,
  textOnly  = false,
} = {}) {
  return new Promise(resolve => {
    // `settled` prevents double-resolution when req.destroy() is called:
    // destroying fires an 'error' event, but by then we've already resolved.
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => done(null), timeoutMs);

    const attempt = (currentUrl, hops) => {
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(currentUrl, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
      }, res => {
        // Follow standard HTTP redirects up to the hop limit
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops > 0) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, currentUrl).href;
          res.resume(); // drain and discard the redirect body
          return attempt(next, hops - 1);
        }

        // Reject binary/non-text responses when textOnly is set.
        // This prevents PDF or image bytes being passed to an HTML parser.
        if (textOnly) {
          const ct = (res.headers['content-type'] || '').toLowerCase();
          const isText = ct.includes('text/') || ct.includes('application/xhtml') ||
                         ct.includes('application/xml') || ct.includes('application/json');
          if (!isText) {
            res.resume(); // drain and discard
            return done(null);
          }
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
          if (body.length > maxBytes || (stopEarly && stopEarly(body))) {
            // Resolve with what we have BEFORE destroying so the 'error' event
            // that destroy triggers doesn't overwrite the result with null.
            done(body);
            req.destroy();
          }
        });
        res.on('end',   () => done(body));
        res.on('error', () => done(null)); // only fires if not already settled
      });
      req.on('error', () => done(null));
    };

    attempt(url, maxHops);
  });
}

/**
 * Fetch only the <title> from a URL.
 * Downloads no more than 50 KB and stops as soon as </title> is seen.
 *
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchTitle(url) {
  const html = await fetchUrl(url, {
    timeoutMs: 8_000,
    maxHops:   3,
    maxBytes:  50_000,
    textOnly:  true,
    stopEarly: body => /<\/title>/i.test(body),
  });
  if (!html) return null;
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match ? match[1].replace(/\s+/g, ' ').trim() : null;
  return title && title.length > 0 ? title : null;
}

/**
 * Fetch the full HTML body of a URL for content parsing.
 * Returns null for non-text responses (PDF, images, etc.) so callers
 * don't need to detect binary content themselves.
 *
 * @param {string} url
 * @returns {Promise<string|null>}
 */
function fetchHtml(url) {
  return fetchUrl(url, {
    timeoutMs: 15_000,
    maxHops:   5,
    maxBytes:  600_000,
    textOnly:  true,
  });
}

module.exports = { fetchUrl, fetchTitle, fetchHtml };

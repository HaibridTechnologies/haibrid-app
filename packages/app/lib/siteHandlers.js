'use strict';

const https         = require('https');
const { fetchHtml, fetchUrl } = require('./http');
const htmlToText    = require('./htmlToText');

// ─── Handler registry ─────────────────────────────────────────────────────────
// Maps hostname patterns to async handler functions.
// Each handler receives the full URL and returns { text, abstract? },
// or throws an Error with a user-readable message on failure.
// `abstract` is an optional short plain-text excerpt (e.g. paper abstract).
//
// To add a new site: write a handler function below and register it here.
const HANDLERS = [
  { match: h => h === 'arxiv.org',                          fn: handleArxiv   },
  { match: h => h === 'youtube.com' || h === 'youtu.be',   fn: handleYoutube },
];

/**
 * Return a site-specific handler for `url`, or null if none matches.
 * Falls back to generic HTML fetch + htmlToText when null is returned.
 *
 * @param {string} url
 * @returns {Function|null}
 */
function getHandler(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const entry    = HANDLERS.find(h => h.match(hostname));
    return entry ? entry.fn : null;
  } catch (_) {
    return null;
  }
}

// ─── arXiv ────────────────────────────────────────────────────────────────────

/**
 * Parse an arXiv paper URL (supports /pdf/, /abs/, and /html/ variants).
 *
 * Strategy:
 *   1. Try the HTML version of the paper (available for most post-2023 papers).
 *      Applies arXiv-specific cleanup to remove LaTeX/TikZ artifacts.
 *   2. Fall back to the arXiv Atom API which always has title + abstract.
 *
 * The Atom API is always fetched alongside the HTML version so the abstract
 * can be returned as a separate field regardless of which path succeeded.
 *
 * @param {string} url
 * @returns {Promise<{ text: string, abstract: string|null }>}
 */
async function handleArxiv(url) {
  const match = url.match(/arxiv\.org\/(?:pdf|abs|html)\/(\d{4}\.\d+)/i);
  if (!match) throw new Error('Could not extract arXiv paper ID from URL');
  const id = match[1];

  // ── Always fetch Atom API for abstract (fast, ~10 KB) ─────────────────────
  let abstract = null;
  const xml = await fetchHtml(`https://export.arxiv.org/api/query?id_list=${id}`);
  if (xml) {
    const raw = xml.match(/<summary[^>]*>([\s\S]+?)<\/summary>/i)?.[1];
    if (raw) abstract = raw.replace(/\s+/g, ' ').trim();
  }

  // ── Try full HTML version first ────────────────────────────────────────────
  const html = await fetchHtml(`https://arxiv.org/html/${id}`);
  if (html) {
    const raw  = htmlToText(html);
    const text = cleanArxivText(raw);
    if (text && text.length > 200) return { text, abstract };
  }

  // ── Fall back to Atom API text (title + abstract only) ────────────────────
  if (!xml) throw new Error('Failed to fetch arXiv metadata');

  // The API title entry repeats the query at the top — grab the second <title>
  const titleMatches = [...xml.matchAll(/<title[^>]*>([^<]+)<\/title>/gi)];
  const title   = titleMatches[1]?.[1]?.trim() ?? titleMatches[0]?.[1]?.trim();
  const authors = [...xml.matchAll(/<name>([^<]+)<\/name>/gi)]
    .map(m => m[1].trim())
    .join(', ');

  if (!abstract) throw new Error('arXiv API returned no abstract for this paper');

  const text = [
    title   ? `Title: ${title}`     : null,
    authors ? `Authors: ${authors}` : null,
    '',
    abstract,
  ].filter(l => l !== null).join('\n');

  return { text, abstract };
}

/**
 * Post-process raw text extracted from arXiv's HTML version.
 *
 * arXiv papers are compiled from LaTeX, so the HTML contains several
 * categories of noise that survive generic tag-stripping:
 *
 *   1. TikZ diagram source code  — LaTeX commands (`\node`, `\draw`, etc.)
 *      and environment blocks (`{tikzpicture}`, `{scope}`, …)
 *   2. LaTeX math rendering artifacts  — MathML-to-text produces strings like
 *      `italic_P`, `start_POSTSUPERSCRIPT`, `roman_LLM`, etc.
 *   3. Broken table cells  — each `<td>` becomes its own line, so a table
 *      column of numbers appears as one number per line.
 *   4. Duplicate title  — the paper title often appears twice at the top.
 *
 * @param {string} text  - Raw output from htmlToText()
 * @returns {string}     - Cleaned plain text
 */
function cleanArxivText(text) {
  const lines = text.split('\n');
  const out   = [];
  let prevLine = '';

  for (const raw of lines) {
    const line = raw.trim();

    // ── Drop LaTeX command lines ───────────────────────────────────────────
    // Lines starting with \ (LaTeX commands) or { (environment blocks)
    if (/^[\\{]/.test(line)) continue;

    // ── Drop TikZ diagram content ──────────────────────────────────────────
    if (/tikz|roundnode|xshift|yshift|draw=|fill=|minimum size|very thick/.test(line)) continue;

    // ── Drop orphaned single words that look like LaTeX identifiers ─────────
    // e.g. "positioning" left behind after \usetikzlibrary{positioning} is stripped
    if (/^[a-z]+$/.test(line) && line.length < 20) continue;

    // ── Drop bare numbers and table cell remnants ──────────────────────────
    // Catches plain numbers, percentages, numbers in parentheses (table cells),
    // and standalone dashes used as empty table cells.
    if (/^\(?\d+(\.\d+)?\)?[%]?$/.test(line)) continue;
    if (/^[–—-]+$/.test(line)) continue;

    // ── Strip inline LaTeX math rendering artifacts ────────────────────────
    // MathML converts variables/operators into patterns like:
    //   "P𝑃Pitalic_P"  →  "P"
    //   "italic_M start_POSTSUPERSCRIPT ′ end_POSTSUPERSCRIPT"  →  ""
    //   "start_FLOATSUBSCRIPT PaLM 2-L end_FLOATSUBSCRIPT"  →  ""
    let cleaned = line
      .replace(/\b(italic|bold|roman|caligraphic|sans-serif|monospace)_\S+/g, '')
      .replace(/start_(POSTSUPERSCRIPT|PRESUPERSCRIPT|FLOATSUBSCRIPT|FLOATSUPERSCRIPT)[^e]*end_\1/g, '')
      .replace(/start_(POSTSUPERSCRIPT|PRESUPERSCRIPT|FLOATSUBSCRIPT|FLOATSUPERSCRIPT)\s*\S*\s*end_\w+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleaned) continue;

    // ── Deduplicate consecutive identical lines (repeated title, etc.) ─────
    if (cleaned === prevLine) continue;

    out.push(cleaned);
    prevLine = cleaned;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

/**
 * Parse a YouTube video page.
 *
 * YouTube's page is JS-rendered, but the initial HTML embeds all video data
 * in inline JSON.  We extract:
 *   - Title        from the schema.org JSON-LD block (~617 KB into the page)
 *   - Description  from `shortDescription` in ytInitialPlayerResponse (~663 KB)
 *   - Author       from `"author":"..."` in the same JSON blob
 *   - Transcript   from the caption track URL embedded in ytInitialPlayerResponse
 *
 * The shortDescription and caption data sit past 600 KB, so we fetch up to 2 MB.
 *
 * @param {string} url
 * @returns {Promise<{ text: string, abstract: null }>}
 */
async function handleYoutube(url) {
  // YouTube's relevant data sits past the default 600 KB limit
  const html = await fetchUrl(url, { maxBytes: 2_000_000, timeoutMs: 25_000, textOnly: true });
  if (!html) throw new Error('Failed to fetch YouTube page');

  // ── Title: from schema.org JSON-LD (~617 KB into the page) ─────────────────
  let title = null;
  const ldIdx = html.indexOf('application/ld+json');
  if (ldIdx !== -1) {
    try {
      const start = html.indexOf('>', ldIdx) + 1;
      const end   = html.indexOf('</script>', start);
      const data  = JSON.parse(html.slice(start, end));
      title = data.name || null;
    } catch (_) {}
  }

  // ── Description: from shortDescription in ytInitialPlayerResponse (~663 KB) ─
  const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  const description = descMatch
    ? descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
    : null;

  // ── Author / channel name ───────────────────────────────────────────────────
  const authorMatch = html.match(/"author":"([^"]+)"/);
  const author = authorMatch?.[1] ?? null;

  if (!title && !description) {
    throw new Error('No video data found — the video may be private or age-restricted');
  }

  // ── Transcript: fetch via InnerTube API (no cookies needed) ─────────────────
  const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([^"&?/\s]{11})/);
  const transcript = videoIdMatch ? await fetchYoutubeTranscript(videoIdMatch[1]) : null;

  const text = [
    title  ? `Title: ${title}`   : null,
    author ? `By: ${author}`     : null,
    '',
    description ? `[Description]\n${description}` : null,
    transcript  ? `\n[Transcript]\n${transcript}`  : null,
  ].filter(l => l !== null).join('\n');

  return { text, abstract: null };
}

/**
 * Fetch a YouTube transcript via the InnerTube API (Android client).
 *
 * Uses a POST request with Android app credentials — this bypasses the
 * session-cookie requirement that blocks plain GET requests to the timedtext URL.
 *
 * @param {string} videoId
 * @returns {Promise<string|null>}  Plain-text transcript, or null if unavailable
 */
async function fetchYoutubeTranscript(videoId) {
  const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
  const CLIENT_VERSION = '20.10.38';
  const UA = `com.google.android.youtube/${CLIENT_VERSION} (Linux; U; Android 14)`;

  // ── Step 1: get caption track list via InnerTube POST ────────────────────────
  const playerJson = await new Promise(resolve => {
    const body = JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: CLIENT_VERSION } },
      videoId,
    });
    const req = https.request(INNERTUBE_URL, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     UA,
      },
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10_000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });

  const tracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  // ── Step 2: fetch the XML for the first (default) caption track ──────────────
  const trackUrl = tracks[0].baseUrl;
  const xml = await fetchUrl(trackUrl, { timeoutMs: 10_000, textOnly: true });
  if (!xml) return null;

  return parseTranscriptXml(xml);
}

/**
 * Parse YouTube's timed-text XML into a plain-text string.
 * Handles both <text start dur> (legacy) and <p t d> (modern) formats.
 *
 * @param {string} xml
 * @returns {string}
 */
function parseTranscriptXml(xml) {
  const decodeEntities = s => s
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#39;/g,   "'")
    .replace(/&apos;/g,  "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));

  const segments = [];

  // Modern format: <p t="..." d="...">...<s>word</s>...</p>
  const modernRe = /<p\s[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = modernRe.exec(xml)) !== null) {
    let text = '';
    const wordRe = /<s[^>]*>([^<]*)<\/s>/g;
    let w;
    while ((w = wordRe.exec(m[1])) !== null) text += w[1];
    if (!text) text = m[1].replace(/<[^>]+>/g, '');
    const clean = decodeEntities(text).trim();
    if (clean) segments.push(clean);
  }

  // Legacy format: <text start="..." dur="...">...</text>
  if (segments.length === 0) {
    const legacyRe = /<text[^>]*>([\s\S]*?)<\/text>/g;
    while ((m = legacyRe.exec(xml)) !== null) {
      const clean = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
      if (clean) segments.push(clean);
    }
  }

  return segments.join(' ').replace(/\s{2,}/g, ' ').trim();
}

module.exports = { getHandler };

'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const helmet  = require('helmet');
const fs      = require('fs');
const path    = require('path');
const contentQueue = require('./contentQueue');
const logger       = require('./lib/logger');

const app  = express();
const PORT = 3000;
const DIST = path.join(__dirname, 'dist');

// ─── Middleware ───────────────────────────────────────────────────────────────

// Security headers (XSS filter, hide X-Powered-By, etc.)
app.use(helmet({
  contentSecurityPolicy: false,   // CSP managed by Vite / the SPA
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '15mb' }));

// CORS — restrict to the browser extension and the local Vite dev server.
// chrome-extension:// origins are sent verbatim by Chrome; we also allow the
// local dev server so hot-reload proxying keeps working.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',   // Vite dev server
  'http://localhost:3000',   // production self-origin
]);

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  // chrome-extension:// origins are always trusted (the extension popup)
  const allowed = ALLOWED_ORIGINS.has(origin) || origin.startsWith('chrome-extension://');
  if (allowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(allowed ? 200 : 403);
  next();
});

// In production serve the Vite build; in dev Vite runs separately on :5173
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
}

// Serve saved PDFs under /pdfs/:id.pdf
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/links',        require('./routes/links'));
app.use('/api/links',        require('./routes/content'));  // content sub-routes live under /api/links/:id/content
app.use('/api/projects',     require('./routes/projects'));
app.use('/api/visits',       require('./routes/visits'));
app.use('/api/chat',         require('./routes/chat'));
app.use('/api/feedback',     require('./routes/feedback'));

// Expose extension-relevant config defaults (dwell time, cache TTL)
app.get('/api/config', (req, res) => {
  const { visits } = require('./lib/config');
  res.json({ visits });
});

// Extension debug log — writes timestamped lines to ext-debug.log
const EXT_LOG_DIR     = path.join(__dirname, 'logs');
const EXT_LOG         = path.join(EXT_LOG_DIR, 'ext-debug.log');
const EXT_LOG_LEVELS  = new Set(['debug', 'info', 'warn', 'error']);
const EXT_LOG_MAX_LEN = 2000;
app.post('/api/ext-log', (req, res) => {
  const { level: rawLevel, msg: rawMsg } = req.body || {};
  const level = EXT_LOG_LEVELS.has(rawLevel) ? rawLevel : 'info';
  // Strip control characters and cap length to prevent log injection / abuse
  const msg   = String(rawMsg || '').replace(/[\r\n]/g, ' ').slice(0, EXT_LOG_MAX_LEN);
  const line  = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try {
    if (!fs.existsSync(EXT_LOG_DIR)) fs.mkdirSync(EXT_LOG_DIR, { recursive: true });
    fs.appendFileSync(EXT_LOG, line);
  } catch (err) {
    logger.warn(`[ext-log] Failed to write log: ${err.message}`);
  }
  res.end();
});

// Queue status endpoint
app.get('/api/content/queue', (req, res) => {
  res.json({ queue: contentQueue.getQueue(), processing: contentQueue.isProcessing() });
});

// On-demand reconciliation: checks all links for missing content files and re-queues as needed
app.post('/api/content/reconcile', async (req, res, next) => {
  try {
    const result = await contentQueue.reconcile();
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Production fallback ──────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ─── Global error handler ─────────────────────────────────────────────────────
// Must be registered after all routes. Catches errors forwarded by asyncHandler
// and any synchronous throws inside route handlers.
app.use((err, _req, res, _next) => {
  logger.error(err);
  const status = err.status || 500;
  const msg = status < 500 ? (err.message || 'Request error') : 'Internal server error';
  res.status(status).json({ error: msg });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const mode = fs.existsSync(DIST) ? 'production' : 'development';
  console.log(`App running in ${mode} mode at http://localhost:${PORT}`);
  if (mode === 'development') console.log('Frontend dev server: http://localhost:5173');
  // Audit links on startup and every hour thereafter
  contentQueue.reconcile().catch(err => logger.error('[reconcile] startup audit failed:', err.message));
  setInterval(() => contentQueue.reconcile().catch(err => logger.error('[reconcile] periodic audit failed:', err.message)), 60 * 60 * 1000);
});

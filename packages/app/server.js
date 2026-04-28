'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const contentQueue = require('./contentQueue');

const app  = express();
const PORT = 3000;
const DIST = path.join(__dirname, 'dist');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));

// Allow the browser extension (chrome-extension://) and Vite dev server to call the API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
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
app.use('/api/tasks',        require('./routes/tasks'));
app.use('/api/visits',       require('./routes/visits'));
app.use('/api/chat',         require('./routes/chat'));
app.use('/api/feedback',     require('./routes/feedback'));

// Expose extension-relevant config defaults (dwell time, cache TTL)
app.get('/api/config', (req, res) => {
  const { visits } = require('./lib/config');
  res.json({ visits });
});

// Queue status endpoint
app.get('/api/content/queue', (req, res) => {
  res.json({ queue: contentQueue.getQueue(), processing: contentQueue.isProcessing() });
});

// On-demand reconciliation: checks all links for missing content files and re-queues as needed
app.post('/api/content/reconcile', (req, res) => {
  const result = contentQueue.reconcile();
  res.json(result);
});

// ─── Production fallback ──────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const mode = fs.existsSync(DIST) ? 'production' : 'development';
  console.log(`App running in ${mode} mode at http://localhost:${PORT}`);
  if (mode === 'development') console.log('Frontend dev server: http://localhost:5173');
  // Audit links on startup and every hour thereafter
  contentQueue.reconcile();
  setInterval(contentQueue.reconcile, 60 * 60 * 1000);
});

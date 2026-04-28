'use strict';
const express = require('express');
const router  = express.Router();

const {
  readLinks, writeLinks,
  readIndex, writeIndex,
  readProjects, writeProjects,
} = require('../lib/storage');

// ─── GET /api/projects ────────────────────────────────────────────────────────
// Returns every project with a computed `linkCount` derived from the index,
// so callers never need a separate request to display card counts.
router.get('/', (req, res) => {
  const projects = readProjects();
  const index    = readIndex();
  res.json(projects.map(p => ({ ...p, linkCount: (index[p.id] || []).length })));
});

// ─── POST /api/projects ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, description, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const projects = readProjects();
  const project  = {
    id:          Date.now().toString(),
    name:        name.trim(),
    description: description || '',
    color:       color || '#2563eb',
    createdAt:   new Date().toISOString(),
  };
  projects.unshift(project); // prepend so newest appears first in the grid
  writeProjects(projects);
  res.status(201).json({ ...project, linkCount: 0 });
});

// ─── PATCH /api/projects/:id ──────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const projects = readProjects();
  const project  = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });

  const { name, description, color } = req.body;
  if (name        !== undefined) project.name        = name.trim();
  if (description !== undefined) project.description = description;
  if (color       !== undefined) project.color       = color;
  writeProjects(projects);

  const index = readIndex();
  res.json({ ...project, linkCount: (index[project.id] || []).length });
});

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
// Cascade: also removes the project from the inverted index and from every
// link's `projects` array, so no orphaned references remain.
router.delete('/:id', (req, res) => {
  let projects = readProjects();
  const before = projects.length;
  projects = projects.filter(p => p.id !== req.params.id);
  if (projects.length === before) return res.status(404).json({ error: 'not found' });
  writeProjects(projects);

  // Remove from the inverted index
  const index = readIndex();
  delete index[req.params.id];
  writeIndex(index);

  // Remove the project reference from all links that were tagged with it
  const links = readLinks();
  let changed = false;
  links.forEach(link => {
    if (link.projects && link.projects.includes(req.params.id)) {
      link.projects = link.projects.filter(id => id !== req.params.id);
      changed = true;
    }
  });
  if (changed) writeLinks(links); // only write if something actually changed

  res.status(204).end();
});

module.exports = router;

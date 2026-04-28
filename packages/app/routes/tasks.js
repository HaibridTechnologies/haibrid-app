'use strict';
const express = require('express');
const router  = express.Router();

const { readTasks, writeTasks } = require('../lib/storage');

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
// Returns all tasks unsorted — the client is responsible for ordering
// (it splits into todo/done and sorts by matrix position).
router.get('/', (req, res) => {
  res.json(readTasks());
});

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
// Creates a new task with all priority fields null (unscored) by default.
// The urgency/importance values are set later via PATCH when the user
// positions the dot on the Eisenhower matrix.
router.post('/', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const tasks = readTasks();
  const task  = {
    id:          Date.now().toString(),
    text:        text.trim(),
    important:   null,   // float in [-1, 1], null = unscored
    urgent:      null,   // float in [-1, 1], null = unscored
    dueDate:     null,
    completed:   false,
    completedAt: null,
    createdAt:   new Date().toISOString(),
  };
  tasks.unshift(task); // prepend so newest appears first before scoring
  writeTasks(tasks);
  res.status(201).json(task);
});

// ─── PATCH /api/tasks/:id ─────────────────────────────────────────────────────
// Partial update — only supplied fields are changed.
// Setting `completed: true` stamps completedAt; `false` clears it.
router.patch('/:id', (req, res) => {
  const tasks = readTasks();
  const task  = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });

  const { text, important, urgent, dueDate, completed } = req.body;
  if (text      !== undefined) task.text      = text;
  if (important !== undefined) task.important = important; // null clears the score
  if (urgent    !== undefined) task.urgent    = urgent;
  if (dueDate   !== undefined) task.dueDate   = dueDate;
  if (completed !== undefined) {
    task.completed   = completed;
    task.completedAt = completed ? new Date().toISOString() : null;
  }
  writeTasks(tasks);
  res.json(task);
});

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const tasks   = readTasks();
  const before  = tasks.length;
  const updated = tasks.filter(t => t.id !== req.params.id);
  if (updated.length === before) return res.status(404).json({ error: 'not found' });
  writeTasks(updated);
  res.status(204).end();
});

module.exports = router;

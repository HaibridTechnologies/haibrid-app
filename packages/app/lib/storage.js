'use strict';
const fs   = require('fs');
const path = require('path');

// All JSON data files live alongside this package root
const ROOT = path.join(__dirname, '..');

const FILES = {
  links:          path.join(ROOT, 'links.json'),
  tasks:          path.join(ROOT, 'tasks.json'),
  index:          path.join(ROOT, 'projects-index.json'),
  projects:       path.join(ROOT, 'projects.json'),
  visits:         path.join(ROOT, 'visits.json'),
  visitsPending:  path.join(ROOT, 'visits-pending.json'),
  visitFilters:   path.join(ROOT, 'visit-filters.json'),
  feedback:       path.join(ROOT, 'feedback.json'),
};

/** Read a JSON file, returning `fallback` if the file does not exist. */
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Serialise `data` to a JSON file with 2-space indentation. */
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Domain readers / writers ─────────────────────────────────────────────────

const readLinks    = ()  => readJson(FILES.links,    []);
const writeLinks   = (v) => writeJson(FILES.links,    v);

const readTasks    = ()  => readJson(FILES.tasks,    []);
const writeTasks   = (v) => writeJson(FILES.tasks,    v);

// The index is an inverted map: { [projectId]: [linkId, …] }
// It allows O(1) lookup of links by project instead of scanning every link.
const readIndex    = ()  => readJson(FILES.index,    {});
const writeIndex   = (v) => writeJson(FILES.index,    v);

const readProjects = ()  => readJson(FILES.projects, []);
const writeProjects = (v) => writeJson(FILES.projects, v);

// Visits — rolling log of tracked page visits from the extension
const readVisits    = ()  => readJson(FILES.visits,       []);
const writeVisits   = (v) => writeJson(FILES.visits,       v);

// Pending visits — awaiting LLM evaluation
const readVisitsPending  = ()  => readJson(FILES.visitsPending, []);
const writeVisitsPending = (v) => writeJson(FILES.visitsPending, v);

// Visit filters — block/allow lists, min dwell time, and LLM evaluation prompt
const { visits: visitsConfig } = require('./config');
const readVisitFilters  = ()  => readJson(FILES.visitFilters, {
  blockList: ['instagram.com', 'facebook.com'],
  allowList: ['arxiv.org'],
  minDwellSeconds: visitsConfig.minDwellSeconds,
  evaluationPrompt: '',
});
const writeVisitFilters = (v) => writeJson(FILES.visitFilters, v);

/**
 * Sync the inverted project→links index when a link's project membership changes.
 *
 * Pass `oldProjects = []` when creating a new link.
 * Pass `newProjects = []` when deleting a link.
 * Pass both to reassign a link across projects.
 *
 * Mutates `index` in place — callers must persist it with writeIndex().
 *
 * @param {Object}   index       - The current index object (mutated in place)
 * @param {string}   linkId
 * @param {string[]} oldProjects - Project IDs the link previously belonged to
 * @param {string[]} newProjects - Project IDs the link now belongs to
 */
function updateIndex(index, linkId, oldProjects, newProjects) {
  for (const pid of oldProjects) {
    if (index[pid]) {
      index[pid] = index[pid].filter(id => id !== linkId);
      // Remove the key entirely when the last link leaves the project
      if (index[pid].length === 0) delete index[pid];
    }
  }
  for (const pid of newProjects) {
    if (!index[pid]) index[pid] = [];
    // Guard against duplicate entries if called more than once
    if (!index[pid].includes(linkId)) index[pid].push(linkId);
  }
}

// Feedback — map of { [url]: [{ id, comment, decision, reason, createdAt }] }
const readFeedback  = ()  => readJson(FILES.feedback, {});
const writeFeedback = (v) => writeJson(FILES.feedback, v);

module.exports = {
  readLinks,    writeLinks,
  readTasks,    writeTasks,
  readIndex,    writeIndex,    updateIndex,
  readProjects, writeProjects,
  readVisits,        writeVisits,
  readVisitsPending, writeVisitsPending,
  readVisitFilters,  writeVisitFilters,
  readFeedback,      writeFeedback,
};

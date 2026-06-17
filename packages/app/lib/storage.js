'use strict';
const fs    = require('fs');
const path  = require('path');
const { Mutex } = require('async-mutex');

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

/**
 * One mutex per data file — prevents interleaved read-modify-write cycles
 * from concurrent requests corrupting JSON state.
 */
const mutexes = {};
function getMutex(filePath) {
  if (!mutexes[filePath]) mutexes[filePath] = new Mutex();
  return mutexes[filePath];
}

/**
 * Serialise `data` to a JSON file with 2-space indentation.
 * Returns a Promise that resolves once the write is complete and the
 * mutex is released, so callers can await it when ordering matters.
 */
function writeJson(filePath, data) {
  return getMutex(filePath).runExclusive(() => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  });
}

/**
 * Atomically read → modify → write a JSON data file.
 * The entire cycle runs under the file's mutex, preventing TOCTOU races
 * where two concurrent requests read the same state and one overwrites
 * the other's changes.
 *
 * `fn(data)` receives the current file contents (array or object).
 * Mutate `data` in-place; the mutated value is written back automatically.
 * The return value of `fn` is passed through to the caller.
 *
 * @param {string}   filePath
 * @param {*}        fallback  - default value when the file does not exist
 * @param {Function} fn        - async (data) => result
 * @returns {Promise<*>} whatever `fn` returned
 */
async function modifyJson(filePath, fallback, fn) {
  return getMutex(filePath).runExclusive(async () => {
    const data = readJson(filePath, fallback);
    const result = await fn(data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return result;
  });
}

// ─── Domain readers / writers ─────────────────────────────────────────────────

const readLinks    = ()  => readJson(FILES.links,    []);
const writeLinks   = (v) => writeJson(FILES.links,    v);
const modifyLinks  = (fn) => modifyJson(FILES.links,  [], fn);

const readTasks    = ()  => readJson(FILES.tasks,    []);
const writeTasks   = (v) => writeJson(FILES.tasks,    v);

// The index is an inverted map: { [projectId]: [linkId, …] }
// It allows O(1) lookup of links by project instead of scanning every link.
const readIndex    = ()  => readJson(FILES.index,    {});
const writeIndex   = (v) => writeJson(FILES.index,    v);
const modifyIndex  = (fn) => modifyJson(FILES.index,  {}, fn);

const readProjects  = ()  => readJson(FILES.projects, []);
const writeProjects = (v) => writeJson(FILES.projects, v);
const modifyProjects = (fn) => modifyJson(FILES.projects, [], fn);

// Visits — rolling log of tracked page visits from the extension
const readVisits    = ()  => readJson(FILES.visits,       []);
const writeVisits   = (v) => writeJson(FILES.visits,       v);
const modifyVisits  = (fn) => modifyJson(FILES.visits,  [], fn);

// Pending visits — awaiting LLM evaluation
const readVisitsPending  = ()  => readJson(FILES.visitsPending, []);
const writeVisitsPending = (v) => writeJson(FILES.visitsPending, v);
const modifyVisitsPending = (fn) => modifyJson(FILES.visitsPending, [], fn);

// Visit filters — block/allow lists, min dwell time, and LLM evaluation prompt
const { visits: visitsConfig } = require('./config');
const DEFAULT_VISIT_FILTERS = {
  blockList: ['instagram.com', 'facebook.com'],
  allowList: ['arxiv.org'],
  minDwellSeconds: visitsConfig.minDwellSeconds,
  evaluationPrompt: '',
};
const readVisitFilters  = ()  => readJson(FILES.visitFilters, DEFAULT_VISIT_FILTERS);
const writeVisitFilters = (v) => writeJson(FILES.visitFilters, v);
const modifyVisitFilters = (fn) => modifyJson(FILES.visitFilters, DEFAULT_VISIT_FILTERS, fn);

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
const modifyFeedback = (fn) => modifyJson(FILES.feedback, {}, fn);

/**
 * Express middleware: load all links, find the one matching `:id`,
 * and attach both `req.links` and `req.link`.  Returns 404 if not found.
 */
function findLink(req, res, next) {
  const links = readLinks();
  const link  = links.find(l => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'not found' });
  req.links = links;
  req.link  = link;
  next();
}

module.exports = {
  readLinks,    writeLinks,    modifyLinks,
  readTasks,    writeTasks,
  readIndex,    writeIndex,    modifyIndex,    updateIndex,
  readProjects, writeProjects, modifyProjects,
  readVisits,        writeVisits,        modifyVisits,
  readVisitsPending, writeVisitsPending,  modifyVisitsPending,
  readVisitFilters,  writeVisitFilters,   modifyVisitFilters,
  readFeedback,      writeFeedback,       modifyFeedback,
  findLink,
};

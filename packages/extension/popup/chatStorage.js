import * as logger from './logger.js';

const MAX_MESSAGES = 60;
const MAX_URLS     = 100;
const EXPIRE_MS    = 30 * 24 * 60 * 60 * 1000;

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function storageKey(url) {
  return `chat:${normalizeUrl(url)}`;
}

async function getIndex() {
  const result = await chrome.storage.local.get('chat:index');
  return result['chat:index'] || [];
}

async function setIndex(arr) {
  await chrome.storage.local.set({ 'chat:index': arr });
}

async function evictIfNeeded(index) {
  if (index.length <= MAX_URLS) return index;
  const sorted = [...index].sort((a, b) => a.lastUpdated - b.lastUpdated);
  const toRemove = sorted.slice(0, index.length - MAX_URLS);
  await chrome.storage.local.remove(toRemove.map(e => storageKey(e.url)));
  const removeSet = new Set(toRemove.map(e => e.url));
  return index.filter(e => !removeSet.has(e.url));
}

export async function loadChat(url) {
  if (!url) { logger.log('[chatStorage] loadChat: no url'); return null; }
  const key = storageKey(url);
  logger.log('[chatStorage] loadChat key:', key);
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) { logger.log('[chatStorage] loadChat: no entry found'); return null; }
  if (Date.now() - entry.lastUpdated > EXPIRE_MS) {
    logger.log('[chatStorage] loadChat: entry expired, clearing');
    await clearChat(url);
    return null;
  }
  logger.log('[chatStorage] loadChat: found', entry.messages.length, 'messages');
  return { messages: entry.messages || [], linkId: entry.linkId || null };
}

export async function saveChat(url, messages, linkId) {
  logger.log('[chatStorage] saveChat called, url:', url, 'messages:', messages.length);
  if (!url || !messages.length) { logger.log('[chatStorage] saveChat: bailing (no url or empty messages)'); return; }
  const trimmed = messages.slice(-MAX_MESSAGES);
  const lastUpdated = Date.now();
  const key = storageKey(url);
  logger.log('[chatStorage] saveChat writing key:', key);
  await chrome.storage.local.set({
    [key]: { messages: trimmed, linkId: linkId || null, lastUpdated },
  });
  logger.log('[chatStorage] saveChat: entry written, updating index');
  const normalUrl = normalizeUrl(url);
  let index = await getIndex();
  index = index.filter(e => e.url !== normalUrl);
  index.push({ url: normalUrl, lastUpdated });
  index = await evictIfNeeded(index);
  await setIndex(index);
  logger.log('[chatStorage] saveChat: index updated, done');
}

export async function clearChat(url) {
  if (!url) return;
  logger.log('[chatStorage] clearChat:', url);
  await chrome.storage.local.remove(storageKey(url));
  const normalUrl = normalizeUrl(url);
  const index = (await getIndex()).filter(e => e.url !== normalUrl);
  await setIndex(index);
}

export async function clearAllChats() {
  const index = await getIndex();
  await chrome.storage.local.remove([...index.map(e => storageKey(e.url)), 'chat:index']);
}

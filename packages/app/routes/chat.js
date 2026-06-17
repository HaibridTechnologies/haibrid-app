'use strict';

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { chat: chatPrompt } = require('../lib/prompts');
const { readLinks, readIndex } = require('../lib/storage');
const logger   = require('../lib/logger');

const router = express.Router();
const CONTENT_DIR = path.join(__dirname, '..', 'content');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Max chars of page content to include in context (~12k tokens in Haiku)
const MAX_CONTENT_CHARS = 50_000;
// Per-link char budget when building multi-doc project context
const PER_LINK_CHARS = 8_000;

let _client = null;
function client() {
  if (!_client) {
    const raw = new Anthropic();
    // Wrap with LangSmith tracing when LANGSMITH_TRACING is set.
    // Falls back to the plain client if the env var is absent or wrapSDK fails.
    if (process.env.LANGSMITH_TRACING === 'true') {
      try {
        const { wrapSDK } = require('langsmith/wrappers');
        _client = wrapSDK(raw);
      } catch {
        _client = raw;
      }
    } else {
      _client = raw;
    }
  }
  return _client;
}

/**
 * Build the system prompt based on available context.
 *
 * Scenarios:
 *   no content + no selection  → plain assistant
 *   link metadata only         → title, abstract, summary injected
 *   content only               → full page text included
 *   selection only             → selected text as primary context
 *   content + selection        → both, with selection emphasised
 *
 * Link metadata (title, abstract, summary) is always injected when
 * available so the model has structured knowledge even when the raw
 * content file is empty or contains only boilerplate.
 */
function buildSystem(pageContent, selectedText, pageUrl, link) {
  const base = chatPrompt.system;
  const hasContent  = Boolean(pageContent);
  const hasSelect   = Boolean(selectedText);
  const hasMeta     = link && (link.title || link.abstract || link.summary);

  if (!hasContent && !hasSelect && !hasMeta) {
    return base;
  }

  const parts = [base, ''];

  if (pageUrl) {
    parts.push(`The user is currently viewing: ${pageUrl}`, '');
  }

  // Structured metadata — always inject when present; gives the model
  // title/abstract/summary even if raw page text is sparse.
  if (hasMeta) {
    parts.push('--- LINK METADATA ---');
    if (link.title)    parts.push(`Title: ${link.title}`);
    if (link.abstract) parts.push(`\nAbstract:\n${link.abstract}`);
    if (link.summary)  parts.push(`\nAI Summary:\n${link.summary}`);
    parts.push('--- END LINK METADATA ---', '');
  }

  if (hasContent && !hasSelect) {
    parts.push(
      '--- PAGE CONTENT ---',
      pageContent.slice(0, MAX_CONTENT_CHARS),
      '--- END PAGE CONTENT ---',
      '',
      'Use the link metadata and page content above to answer the user\'s questions accurately.',
    );
  } else if (!hasContent && hasSelect) {
    parts.push(
      '--- SELECTED TEXT ---',
      selectedText,
      '--- END SELECTED TEXT ---',
      '',
      'The user has highlighted this excerpt from the page. Use it as your primary context.',
    );
  } else if (hasContent && hasSelect) {
    parts.push(
      '--- FULL PAGE CONTENT ---',
      pageContent.slice(0, MAX_CONTENT_CHARS),
      '--- END FULL PAGE CONTENT ---',
      '',
      '--- USER-SELECTED EXCERPT (PRIMARY FOCUS) ---',
      selectedText,
      '--- END SELECTED EXCERPT ---',
      '',
      'The user has highlighted a specific passage from the page. Treat the selected excerpt as the most important context — reference it directly when relevant — while using the full page content for broader understanding.',
    );
  } else if (hasMeta) {
    parts.push('Use the link metadata above to answer the user\'s questions accurately.');
  }

  return parts.join('\n');
}

/**
 * Build a multi-document context string from all parsed links in a project.
 * Each source gets up to PER_LINK_CHARS of full text (or abstract/summary if
 * the content file is missing) with a clear header so the model can cite sources.
 *
 * @param {string} projectId
 * @returns {{ context: string, parsed: number, total: number }}
 */
function buildProjectContext(projectId) {
  const index = readIndex();
  const ids   = index[projectId] || [];
  const links = readLinks().filter(l => ids.includes(l.id));
  const parsed = links.filter(l => l.contentStatus === 'parsed');

  const parts = parsed.map((link, i) => {
    const header = [
      `--- SOURCE ${i + 1}: ${link.title || link.url} ---`,
      `URL: ${link.url}`,
      link.citationCount != null ? `Citations: ${link.citationCount}` : null,
    ].filter(Boolean).join('\n');

    // Try full content file first
    let body = '';
    const contentPath = path.join(CONTENT_DIR, `${link.id}.txt`);
    try {
      const raw = fs.readFileSync(contentPath, 'utf8');
      body = raw.slice(0, PER_LINK_CHARS);
      if (raw.length > PER_LINK_CHARS) body += '\n[…truncated]';
    } catch {
      // Fall back to stored abstract/summary
      if (link.abstract) body += `Abstract: ${link.abstract}\n`;
      if (link.summary)  body += `Summary: ${link.summary}`;
    }

    return `${header}\n\n${body.trim()}`;
  });

  return {
    context: parts.join('\n\n'),
    parsed:  parsed.length,
    total:   links.length,
  };
}

// Models available for selection in the research chat UI.
// Exported so the client can fetch the list rather than hard-coding it.
const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', note: 'Balanced · default',    default: true },
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5',  note: 'Fast · low cost'                     },
  { id: 'claude-sonnet-4-6',          label: 'Sonnet 4.6', note: 'Latest Sonnet'                        },
  { id: 'claude-opus-4-5-20251101',   label: 'Opus 4.5',   note: 'Most capable · slowest'               },
];

/**
 * Run a single chat turn without web search.
 * @param {string} [modelOverride] - Optional model ID; falls back to prompts default.
 */
async function runPlainChat(systemPrompt, messages, modelOverride) {
  const model = modelOverride || chatPrompt.model;
  const response = await client().messages.create({
    model,
    max_tokens: chatPrompt.max_tokens,
    system:     systemPrompt,
    messages,
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { text, usage: response.usage };
}

/**
 * Run a chat turn with the web_search_20250305 built-in tool (Sonnet).
 *
 * Anthropic executes the search server-side; we drive a simple agentic loop
 * so the model can search multiple times before giving a final answer.
 */
async function runWebSearch(systemPrompt, messages) {
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  let msgs    = [...messages];
  let text    = '';
  let usage   = {};

  for (let iter = 0; iter < 6; iter++) {
    const resp = await client().messages.create({
      model:      chatPrompt.modelWithSearch,
      max_tokens: chatPrompt.max_tokens,
      system:     systemPrompt,
      tools,
      messages:   msgs,
    });

    usage = resp.usage;

    // Collect any text the model produced in this turn
    const textBlocks = resp.content.filter(b => b.type === 'text');
    if (textBlocks.length) text = textBlocks.map(b => b.text).join('').trim();

    // Done — no more tool calls
    if (resp.stop_reason !== 'tool_use') break;

    // Append assistant turn and acknowledge tool results so the loop continues.
    // web_search is server-side: Anthropic executes the search and injects results
    // automatically when we pass back an empty tool_result for each tool_use block.
    msgs.push({ role: 'assistant', content: resp.content });

    const toolResults = resp.content
      .filter(b => b.type === 'tool_use')
      .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));

    if (!toolResults.length) break;
    msgs.push({ role: 'user', content: toolResults });
  }

  return { text, usage };
}

/** GET /api/chat/models — list models available for the research chat UI */
router.get('/models', (_req, res) => res.json(AVAILABLE_MODELS));

/**
 * POST /api/chat
 *
 * Body:
 *   message      {string}   — the user's new message
 *   history      {Array}    — prior turns: [{ role, content }, ...]
 *   linkId       {string?}  — single-link mode: loads content/{linkId}.txt
 *   projectId    {string?}  — project mode: loads all parsed links in the project
 *   model        {string?}  — model ID override (must be in AVAILABLE_MODELS)
 *   selectedText {string?}  — text the user highlighted on the page
 *   pageUrl      {string?}  — URL of the current tab (for display in system prompt)
 *   webSearch    {boolean}  — if true, Sonnet + web_search tool is used
 *
 * Response: SSE stream of { text } chunks, terminated by { done, sourcesUsed?, sourcesTotal? }
 *           or { error } on failure.
 */
router.post('/', async (req, res) => {
  const { message, history = [], linkId, projectId, model: modelReq, selectedText, pageUrl, webSearch = false } = req.body;

  // Validate model override against the allowlist
  const modelOverride = AVAILABLE_MODELS.find(m => m.id === modelReq)?.id || null;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // Validate IDs to prevent path traversal via crafted linkId/projectId
  if (linkId && !UUID_RE.test(linkId)) {
    return res.status(400).json({ error: 'invalid linkId' });
  }
  if (projectId && !UUID_RE.test(projectId)) {
    return res.status(400).json({ error: 'invalid projectId' });
  }

  let pageContent  = null;
  let link         = null;
  let sourcesUsed  = undefined;
  let sourcesTotal = undefined;

  if (projectId) {
    // ── Project mode: concatenate content from all parsed links ───────────────
    const { context, parsed, total } = buildProjectContext(projectId);
    pageContent  = context || null;
    sourcesUsed  = parsed;
    sourcesTotal = total;
    logger.info(`[chat] project mode | projectId=${projectId} | sources=${parsed}/${total}`);
  } else if (linkId) {
    // ── Single-link mode ──────────────────────────────────────────────────────
    const contentPath = path.join(CONTENT_DIR, `${linkId}.txt`);
    try {
      pageContent = fs.readFileSync(contentPath, 'utf8');
    } catch {
      logger.warn(`[chat] content file not found for linkId=${linkId}`);
    }
    try {
      const links = readLinks();
      link = links.find(l => l.id === linkId) || null;
    } catch {
      logger.warn(`[chat] could not load link metadata for linkId=${linkId}`);
    }
  }

  const systemPrompt = buildSystem(pageContent, selectedText || null, pageUrl || null, link);

  const messages = [
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: message },
  ];

  logger.info(`[chat] request | linkId=${linkId || 'none'} | hasSelection=${Boolean(selectedText)} | webSearch=${webSearch} | historyLen=${history.length}`);

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    if (webSearch) {
      // Web search uses an agentic tool loop — run it to completion then send
      // the full reply as a single text chunk followed by done.
      const { text: reply, usage } = await runWebSearch(systemPrompt, messages);
      logger.info(`[chat] reply | model=${chatPrompt.modelWithSearch} | in=${usage?.input_tokens} | out=${usage?.output_tokens}`);
      send({ text: reply });
      send({ done: true, sourcesUsed, sourcesTotal });
    } else {
      // Plain chat — stream text deltas as they arrive
      const model = modelOverride || chatPrompt.model;
      const stream = client().messages.stream({
        model,
        max_tokens: chatPrompt.max_tokens,
        system:     systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          send({ text: event.delta.text });
        }
      }

      const final = await stream.finalMessage();
      logger.info(`[chat] reply | model=${model} | in=${final.usage?.input_tokens} | out=${final.usage?.output_tokens}`);
      send({ done: true, sourcesUsed, sourcesTotal });
    }
  } catch (err) {
    logger.error(`[chat] Anthropic API error: ${err.message}`);
    send({ error: 'Failed to generate reply' });
  }

  res.end();
});

module.exports = router;

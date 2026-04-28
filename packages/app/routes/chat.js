'use strict';

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { chat: chatPrompt } = require('../lib/prompts');
const logger   = require('../lib/logger');

const router = express.Router();
const CONTENT_DIR = path.join(__dirname, '..', 'content');

// Max chars of page content to include in context (~12k tokens in Haiku)
const MAX_CONTENT_CHARS = 50_000;

let _client = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Build the system prompt based on available context.
 *
 * Scenarios:
 *   no content + no selection  → plain assistant
 *   content only               → page content included
 *   selection only             → selected text as primary context
 *   content + selection        → both, with selection emphasised
 */
function buildSystem(pageContent, selectedText, pageUrl) {
  const base = chatPrompt.system;

  if (!pageContent && !selectedText) {
    return base;
  }

  const parts = [base, ''];

  if (pageUrl) {
    parts.push(`The user is currently viewing: ${pageUrl}`, '');
  }

  if (pageContent && !selectedText) {
    parts.push(
      '--- PAGE CONTENT ---',
      pageContent.slice(0, MAX_CONTENT_CHARS),
      '--- END PAGE CONTENT ---',
      '',
      'Use the page content above to answer the user\'s questions accurately.',
    );
  } else if (!pageContent && selectedText) {
    parts.push(
      '--- SELECTED TEXT ---',
      selectedText,
      '--- END SELECTED TEXT ---',
      '',
      'The user has highlighted this excerpt from the page. Use it as your primary context.',
    );
  } else if (pageContent && selectedText) {
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
  }

  return parts.join('\n');
}

/**
 * Run a single chat turn without web search (Haiku).
 */
async function runPlainChat(systemPrompt, messages) {
  const response = await client().messages.create({
    model:      chatPrompt.model,
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

/**
 * POST /api/chat
 *
 * Body:
 *   message      {string}   — the user's new message
 *   history      {Array}    — prior turns: [{ role, content }, ...]
 *   linkId       {string?}  — if set, page content is loaded from content/{linkId}.txt
 *   selectedText {string?}  — text the user highlighted on the page
 *   pageUrl      {string?}  — URL of the current tab (for display in system prompt)
 *   webSearch    {boolean}  — if true, Sonnet + web_search tool is used
 *
 * Response: { reply: string }
 */
router.post('/', async (req, res) => {
  const { message, history = [], linkId, selectedText, pageUrl, webSearch = false } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // Load saved page content if a linkId was provided
  let pageContent = null;
  if (linkId) {
    const contentPath = path.join(CONTENT_DIR, `${linkId}.txt`);
    try {
      pageContent = fs.readFileSync(contentPath, 'utf8');
    } catch {
      logger.warn(`[chat] content file not found for linkId=${linkId}`);
    }
  }

  const systemPrompt = buildSystem(pageContent, selectedText || null, pageUrl || null);

  const messages = [
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: message },
  ];

  logger.info(`[chat] request | linkId=${linkId || 'none'} | hasSelection=${Boolean(selectedText)} | webSearch=${webSearch} | historyLen=${history.length}`);

  try {
    const { text: reply, usage } = webSearch
      ? await runWebSearch(systemPrompt, messages)
      : await runPlainChat(systemPrompt, messages);

    logger.info(`[chat] reply | model=${webSearch ? 'sonnet+web' : 'haiku'} | in=${usage?.input_tokens} | out=${usage?.output_tokens}`);

    res.json({ reply });
  } catch (err) {
    logger.error(`[chat] Anthropic API error: ${err.message}`);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

module.exports = router;

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { summarize: config } = require('./prompts');
const { content: contentConfig } = require('./config');

// Lazy-initialise the client so the module can be required even when
// ANTHROPIC_API_KEY is not set (errors surface only when summarize() is called).
let _client = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Generate a plain-text summary of `text` using the Anthropic API.
 * Prompt, model, and token settings are defined in lib/prompts.js.
 *
 * @param {string} text - Full plain-text content to summarise
 * @returns {Promise<string>} - The generated summary
 */
async function summarize(text) {
  const input = text.length > contentConfig.summarizeMaxChars
    ? text.slice(0, contentConfig.summarizeMaxChars)
    : text;

  const message = await client().messages.create({
    model:      config.model,
    max_tokens: config.max_tokens,
    system:     config.system,
    messages:   [{ role: 'user', content: input }],
  });

  return message.content[0].text.trim();
}

module.exports = { summarize };

'use strict';
const Anthropic     = require('@anthropic-ai/sdk');
const { traceable } = require('langsmith/traceable');
const { wrapSDK }   = require('langsmith/wrappers');
const config        = require('./prompts').evaluateVisits;
const logger        = require('./logger');

// Wrap a fresh instance each call so the active LangSmith trace context
// is always captured as the parent run for the Anthropic API call.
function client() {
  return wrapSDK(new Anthropic());
}

/**
 * Evaluate a batch of pending visits against the user's evaluation prompt.
 *
 * @param {Object[]} visits           - Array of pending visit objects
 * @param {string}   evaluationPrompt - Free-form user criteria
 * @returns {Promise<Array<{ id: string, keep: boolean, reason: string }>>}
 */
/** Evaluate a single batch of visits (≤ batch_size) against the user's criteria. */
async function evaluateBatch(visits, evaluationPrompt, batchIndex) {
  const visitsText = visits.map((v, i) =>
    `${i + 1}. id="${v.id}" | title="${v.title || '(no title)'}" | domain="${v.domain}" | url="${v.url}" | dwell=${v.dwellSeconds}s`
  ).join('\n');

  const userMessage =
    `User criteria: ${evaluationPrompt || 'Keep anything genuinely interesting or informative. Drop low-quality, clickbait, or irrelevant content.'}\n\n` +
    `Visits to evaluate:\n${visitsText}`;

  logger.log(`[evaluateVisits] Batch ${batchIndex}: sending ${visits.length} visits to ${config.model}…`);

  const t0      = Date.now();
  const message = await client().messages.create({
    model:      config.model,
    max_tokens: config.max_tokens,
    system:     config.system,
    messages:   [{ role: 'user', content: userMessage }],
  });
  logger.log(`[evaluateVisits] Batch ${batchIndex}: response in ${Date.now() - t0}ms | tokens in=${message.usage.input_tokens} out=${message.usage.output_tokens}`);

  const raw     = message.content[0].text.trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let results;
  try {
    results = JSON.parse(cleaned);
  } catch {
    logger.warn(`[evaluateVisits] Batch ${batchIndex}: ⚠ JSON parse failed — keeping all by default`);
    logger.warn(`[evaluateVisits] Cleaned string: ${cleaned.slice(0, 500)}`);
    results = visits.map(v => ({ id: v.id, keep: true, reason: 'Parse error — kept by default.' }));
  }

  return results;
}

const evaluateVisits = traceable(async function evaluateVisits(visits, evaluationPrompt) {
  if (!visits.length) return [];

  const BATCH_SIZE = config.batch_size || 30;
  logger.log(`\n[evaluateVisits] ── Starting evaluation ──────────────────────`);
  logger.log(`[evaluateVisits] Total visits: ${visits.length} | batch size: ${BATCH_SIZE} | batches: ${Math.ceil(visits.length / BATCH_SIZE)}`);

  // Split into chunks and evaluate sequentially
  const allResults = [];
  for (let i = 0; i < visits.length; i += BATCH_SIZE) {
    const batch       = visits.slice(i, i + BATCH_SIZE);
    const batchIndex  = Math.floor(i / BATCH_SIZE) + 1;
    const batchResults = await evaluateBatch(batch, evaluationPrompt, batchIndex);
    allResults.push(...batchResults);
  }

  const kept    = allResults.filter(r => r.keep !== false);
  const dropped = allResults.filter(r => r.keep === false);
  logger.log(`[evaluateVisits] Final — kept: ${kept.length}, dropped: ${dropped.length}`);
  allResults.forEach(r =>
    logger.log(`  ${r.keep ? '✓ keep' : '✗ drop'} [${r.id}] ${r.reason}`)
  );
  logger.log(`[evaluateVisits] ── Done ────────────────────────────────────────\n`);

  return allResults;
}, { name: 'evaluateVisits', run_type: 'chain' });

module.exports = { evaluateVisits };

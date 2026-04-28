'use strict';

/**
 * Central configuration for all tuneable constants.
 * Change values here — no need to touch the code that uses them.
 */
module.exports = {

  visits: {
    // Minimum active dwell time (seconds) before a visit is recorded.
    // Applied in the extension; also served via GET /api/config so the
    // extension always uses the server's value rather than its own copy.
    minDwellSeconds: 10,

    // How long the extension caches filter rules before re-fetching (ms).
    filtersCacheTtlMs: 20 * 60 * 1000, // 20 minutes

    // Visits older than this are pruned from visits.json on each write.
    maxAgeDays: 90,
  },

  content: {
    // Maximum characters stored per saved page (text truncation limit).
    // Applies in both contentQueue.js and routes/content.js.
    maxChars: 200_000,

    // Maximum characters sent to the summarisation model.
    // Kept lower than maxChars to control token cost.
    summarizeMaxChars: 60_000,
  },

};

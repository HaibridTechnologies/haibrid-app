'use strict';

/**
 * Wrap an async Express route handler so rejected promises are forwarded
 * to Express's error-handling middleware instead of crashing the process.
 *
 * Usage:  router.post('/', wrap(async (req, res) => { … }))
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;

'use strict';
const path    = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

const LOG_DIR = path.join(__dirname, '..', 'logs');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// "2026-04-16T12:14:08.176Z [INFO] message"
const lineFormat = printf(({ level, message, timestamp, stack }) =>
  `${timestamp} [${level.toUpperCase()}] ${stack || message}`
);

const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),   // capture stack traces on Error objects
    lineFormat,
  ),
  transports: [
    // ── Terminal ─────────────────────────────────────────────────
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp(),
        errors({ stack: true }),
        lineFormat,
      ),
    }),

    // ── All levels → daily combined log ──────────────────────────
    new winston.transports.DailyRotateFile({
      dirname:        LOG_DIR,
      filename:       'combined-%DATE%.log',
      datePattern:    'YYYY-MM-DD',
      maxFiles:       '30d',   // keep 30 days
      maxSize:        '20m',   // rotate if a single file exceeds 20 MB
      zippedArchive:  true,    // compress rotated files
    }),

    // ── Errors & warnings only → separate error log ───────────────
    new winston.transports.DailyRotateFile({
      dirname:        LOG_DIR,
      filename:       'error-%DATE%.log',
      datePattern:    'YYYY-MM-DD',
      level:          'warn',
      maxFiles:       '90d',
      maxSize:        '10m',
      zippedArchive:  true,
    }),
  ],
});

// Winston's .log() requires (level, message) — alias it to .info() so
// existing console.log-style calls work without changes.
logger.log = (...args) => logger.info(...args);

module.exports = logger;

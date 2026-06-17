import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../lib/config');

describe('config', () => {
  describe('visits', () => {
    it('has minDwellSeconds as a positive number', () => {
      expect(config.visits.minDwellSeconds).toBeTypeOf('number');
      expect(config.visits.minDwellSeconds).toBeGreaterThan(0);
    });

    it('has filtersCacheTtlMs as a positive number', () => {
      expect(config.visits.filtersCacheTtlMs).toBeTypeOf('number');
      expect(config.visits.filtersCacheTtlMs).toBeGreaterThan(0);
    });

    it('has maxAgeDays as a positive number', () => {
      expect(config.visits.maxAgeDays).toBeTypeOf('number');
      expect(config.visits.maxAgeDays).toBeGreaterThan(0);
    });
  });

  describe('content', () => {
    it('has maxChars as a positive number', () => {
      expect(config.content.maxChars).toBeTypeOf('number');
      expect(config.content.maxChars).toBeGreaterThan(0);
    });

    it('has summarizeMaxChars as a positive number', () => {
      expect(config.content.summarizeMaxChars).toBeTypeOf('number');
      expect(config.content.summarizeMaxChars).toBeGreaterThan(0);
    });

    it('summarizeMaxChars does not exceed maxChars', () => {
      expect(config.content.summarizeMaxChars).toBeLessThanOrEqual(config.content.maxChars);
    });
  });
});

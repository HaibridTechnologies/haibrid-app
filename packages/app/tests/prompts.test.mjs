import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const prompts = require('../lib/prompts');

describe('prompts', () => {
  describe('evaluateVisits', () => {
    it('has required fields', () => {
      expect(prompts.evaluateVisits.model).toBeTypeOf('string');
      expect(prompts.evaluateVisits.max_tokens).toBeTypeOf('number');
      expect(prompts.evaluateVisits.batch_size).toBeTypeOf('number');
      expect(prompts.evaluateVisits.system).toBeTypeOf('string');
    });

    it('system prompt instructs JSON output', () => {
      expect(prompts.evaluateVisits.system).toContain('JSON');
    });

    it('batch_size is positive', () => {
      expect(prompts.evaluateVisits.batch_size).toBeGreaterThan(0);
    });
  });

  describe('chat', () => {
    it('has required fields', () => {
      expect(prompts.chat.model).toBeTypeOf('string');
      expect(prompts.chat.modelWithSearch).toBeTypeOf('string');
      expect(prompts.chat.max_tokens).toBeTypeOf('number');
      expect(prompts.chat.system).toBeTypeOf('string');
    });

    it('has a separate model for web search', () => {
      expect(prompts.chat.modelWithSearch).not.toBe(prompts.chat.model);
    });
  });

  describe('summarize', () => {
    it('has required fields', () => {
      expect(prompts.summarize.model).toBeTypeOf('string');
      expect(prompts.summarize.max_tokens).toBeTypeOf('number');
      expect(prompts.summarize.system).toBeTypeOf('string');
    });

    it('system prompt includes summary guidance', () => {
      expect(prompts.summarize.system).toContain('summary');
    });
  });
});

import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { extractArxivId } = require('../lib/semanticScholar');

describe('extractArxivId', () => {
  it('extracts ID from /abs/ URL', () => {
    expect(extractArxivId('https://arxiv.org/abs/1706.03762')).toBe('1706.03762');
  });

  it('extracts ID from /pdf/ URL', () => {
    expect(extractArxivId('https://arxiv.org/pdf/1706.03762')).toBe('1706.03762');
  });

  it('extracts ID from /html/ URL', () => {
    expect(extractArxivId('https://arxiv.org/html/2301.00001')).toBe('2301.00001');
  });

  it('strips version suffix from /abs/ URL', () => {
    expect(extractArxivId('https://arxiv.org/abs/1706.03762v3')).toBe('1706.03762');
  });

  it('strips version and .pdf suffix from /pdf/ URL', () => {
    expect(extractArxivId('https://arxiv.org/pdf/1706.03762v2.pdf')).toBe('1706.03762');
  });

  it('handles www prefix', () => {
    expect(extractArxivId('https://www.arxiv.org/abs/1706.03762')).toBe('1706.03762');
  });

  it('returns null for non-arxiv URL', () => {
    expect(extractArxivId('https://example.com/paper.pdf')).toBeNull();
  });

  it('returns null for arxiv URL without a valid paper path', () => {
    expect(extractArxivId('https://arxiv.org/search/?query=attention')).toBeNull();
  });

  it('returns null for invalid/malformed URL', () => {
    expect(extractArxivId('not a url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractArxivId('')).toBeNull();
  });

  it('extracts ID with longer numeric portion', () => {
    expect(extractArxivId('https://arxiv.org/abs/2312.12456')).toBe('2312.12456');
  });

  it('extracts five-digit paper numbers', () => {
    expect(extractArxivId('https://arxiv.org/abs/2401.00001')).toBe('2401.00001');
  });
});

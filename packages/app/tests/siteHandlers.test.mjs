import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { getHandler, cleanArxivText } = require('../lib/siteHandlers');

describe('getHandler', () => {
  it('returns a handler for arxiv.org', () => {
    expect(getHandler('https://arxiv.org/abs/2301.00001')).toBeTypeOf('function');
  });

  it('returns a handler for www.arxiv.org', () => {
    expect(getHandler('https://www.arxiv.org/abs/2301.00001')).toBeTypeOf('function');
  });

  it('returns a handler for youtube.com', () => {
    expect(getHandler('https://www.youtube.com/watch?v=abc123')).toBeTypeOf('function');
  });

  it('returns a handler for youtu.be', () => {
    expect(getHandler('https://youtu.be/abc123')).toBeTypeOf('function');
  });

  it('returns null for generic URLs', () => {
    expect(getHandler('https://example.com/article')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(getHandler('not a url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getHandler('')).toBeNull();
  });

  it('returns the same handler for arxiv pdf and abs', () => {
    const absHandler = getHandler('https://arxiv.org/abs/2301.00001');
    const pdfHandler = getHandler('https://arxiv.org/pdf/2301.00001');
    expect(absHandler).toBe(pdfHandler);
  });
});

describe('cleanArxivText', () => {
  it('drops lines starting with backslash (LaTeX commands)', () => {
    const text = '\\usepackage{amsmath}\nActual content here';
    expect(cleanArxivText(text)).toBe('Actual content here');
  });

  it('drops lines starting with curly brace (environment blocks)', () => {
    const text = '{tikzpicture}\nActual content\n{scope}';
    expect(cleanArxivText(text)).toBe('Actual content');
  });

  it('drops TikZ-related content', () => {
    const text = 'Normal text\nroundnode xshift=10\nMore text';
    expect(cleanArxivText(text)).toBe('Normal text\nMore text');
  });

  it('drops orphaned single lowercase words under 20 chars', () => {
    const text = 'Real sentence here.\npositioning\nAnother sentence.';
    expect(cleanArxivText(text)).toBe('Real sentence here.\nAnother sentence.');
  });

  it('drops bare numbers and percentages', () => {
    const text = 'Results:\n42\n99.5%\n(73.2)\nConclusion here.';
    expect(cleanArxivText(text)).toBe('Results:\nConclusion here.');
  });

  it('drops standalone dashes', () => {
    const text = 'Above\n—\n–\n---\nBelow';
    expect(cleanArxivText(text)).toBe('Above\nBelow');
  });

  it('strips inline LaTeX math artifacts', () => {
    const text = 'The probability italic_P is high';
    const result = cleanArxivText(text);
    expect(result).not.toContain('italic_P');
    expect(result).toContain('probability');
  });

  it('strips POSTSUPERSCRIPT artifacts', () => {
    const text = 'Model start_POSTSUPERSCRIPT 2 end_POSTSUPERSCRIPT performance';
    expect(cleanArxivText(text)).toBe('Model performance');
  });

  it('deduplicates consecutive identical lines', () => {
    const text = 'Paper Title\nPaper Title\nAbstract content';
    expect(cleanArxivText(text)).toBe('Paper Title\nAbstract content');
  });

  it('limits consecutive blank lines to one', () => {
    const text = 'Section A\n\n\n\n\nSection B';
    expect(cleanArxivText(text)).not.toMatch(/\n{3,}/);
  });

  it('handles empty input', () => {
    expect(cleanArxivText('')).toBe('');
  });

  it('preserves normal academic text', () => {
    const text = 'We propose a novel method for training language models.\nOur approach improves accuracy by 15%.';
    expect(cleanArxivText(text)).toBe(text);
  });

  it('handles mixed clean and noisy content', () => {
    const text = [
      'Abstract',
      '\\documentclass{article}',
      'We present a new algorithm.',
      '{tikzpicture}',
      'draw= fill= minimum size',
      '42',
      'The results are significant.',
      'The results are significant.',
      'positioning',
    ].join('\n');
    const result = cleanArxivText(text);
    expect(result).toContain('Abstract');
    expect(result).toContain('We present a new algorithm.');
    expect(result).toContain('The results are significant.');
    expect(result).not.toContain('\\documentclass');
    expect(result).not.toContain('{tikzpicture}');
    expect(result).not.toContain('positioning');
    expect(result.match(/The results are significant\./g)).toHaveLength(1);
  });
});

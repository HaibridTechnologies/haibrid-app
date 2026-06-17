import { createRequire } from 'module';
import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies that routes/links.js imports at the top level
vi.mock('../lib/http', () => ({ fetchTitle: vi.fn() }));
vi.mock('../contentQueue', () => ({ CONTENT_DIR: '/tmp', PDF_DIR: '/tmp' }));
vi.mock('../lib/storage', () => ({
  readLinks: vi.fn(() => []),
  writeLinks: vi.fn(async () => {}),
  readIndex: vi.fn(() => ({})),
  writeIndex: vi.fn(async () => {}),
  updateIndex: vi.fn(),
}));
vi.mock('../lib/semanticScholar', () => ({
  extractArxivId: vi.fn(() => null),
  fetchCitationCount: vi.fn(async () => null),
}));

const require = createRequire(import.meta.url);
const { normaliseUrl } = require('../routes/links');

describe('normaliseUrl', () => {
  it('strips tracking params from youtube.com watch URLs', () => {
    expect(normaliseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&feature=share'))
      .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('normalises youtube.com without www', () => {
    expect(normaliseUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc'))
      .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('strips t param from youtu.be short URLs', () => {
    const result = normaliseUrl('https://youtu.be/dQw4w9WgXcQ?t=30');
    expect(result).not.toContain('t=30');
    expect(result).toContain('youtu.be/dQw4w9WgXcQ');
  });

  it('preserves youtu.be URLs without t param', () => {
    const result = normaliseUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result).toContain('youtu.be/dQw4w9WgXcQ');
  });

  it('returns non-YouTube URLs unchanged', () => {
    const url = 'https://arxiv.org/abs/1706.03762?query=attention';
    expect(normaliseUrl(url)).toBe(url);
  });

  it('returns malformed URLs as-is', () => {
    expect(normaliseUrl('not a url')).toBe('not a url');
  });

  it('returns empty string as-is', () => {
    expect(normaliseUrl('')).toBe('');
  });

  it('handles YouTube URL with only v param', () => {
    expect(normaliseUrl('https://www.youtube.com/watch?v=abc123'))
      .toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('handles YouTube URL without v param (channel page)', () => {
    const url = 'https://www.youtube.com/@channel';
    expect(normaliseUrl(url)).toBe(url);
  });
});

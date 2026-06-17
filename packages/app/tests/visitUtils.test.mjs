import { createRequire } from 'module';
import { describe, it, expect, vi } from 'vitest';

// Mock all storage and external dependencies before requiring the module
vi.mock('../lib/storage', () => ({
  readVisits: vi.fn(() => []),
  writeVisits: vi.fn(async () => {}),
  readVisitsPending: vi.fn(() => []),
  writeVisitsPending: vi.fn(async () => {}),
  readVisitFilters: vi.fn(() => ({
    blockList: [], allowList: [], minDwellSeconds: 10, evaluationPrompt: '',
  })),
  writeVisitFilters: vi.fn(async () => {}),
  readLinks: vi.fn(() => []),
  writeLinks: vi.fn(async () => {}),
}));

vi.mock('../lib/evaluateVisits', () => ({
  evaluateVisits: vi.fn(async () => []),
}));

vi.mock('../lib/config', () => ({
  visits: { maxAgeDays: 90, filtersCacheTtlMs: 1200000, minDwellSeconds: 10 },
}));

vi.mock('../lib/logger', () => ({
  default: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const require = createRequire(import.meta.url);
const { pruneOldVisits, deduplicateVisits } = require('../routes/visits');

describe('pruneOldVisits', () => {
  it('keeps recent visits', () => {
    const recent = [
      { id: '1', visitedAt: new Date().toISOString() },
      { id: '2', visitedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    ];
    expect(pruneOldVisits(recent)).toHaveLength(2);
  });

  it('removes visits older than 90 days', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    const visits = [
      { id: '1', visitedAt: recent },
      { id: '2', visitedAt: old },
    ];
    const result = pruneOldVisits(visits);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns empty array when all visits are old', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    expect(pruneOldVisits([{ id: '1', visitedAt: old }])).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(pruneOldVisits([])).toEqual([]);
  });
});

describe('deduplicateVisits', () => {
  it('merges dwell time for duplicate URLs', () => {
    const visits = [
      { id: '1', url: 'https://a.com', dwellSeconds: 30, visitedAt: '2026-06-15T10:00:00Z', title: 'A' },
      { id: '2', url: 'https://a.com', dwellSeconds: 20, visitedAt: '2026-06-16T10:00:00Z', title: 'A updated' },
    ];
    const result = deduplicateVisits(visits);
    expect(result).toHaveLength(1);
    expect(result[0].dwellSeconds).toBe(50);
  });

  it('keeps the most recent timestamp', () => {
    const visits = [
      { id: '1', url: 'https://a.com', dwellSeconds: 10, visitedAt: '2026-06-15T10:00:00Z', title: 'Old' },
      { id: '2', url: 'https://a.com', dwellSeconds: 5, visitedAt: '2026-06-17T10:00:00Z', title: 'New' },
    ];
    const result = deduplicateVisits(visits);
    expect(result[0].visitedAt).toBe('2026-06-17T10:00:00Z');
    expect(result[0].title).toBe('New');
  });

  it('preserves unique URLs', () => {
    const visits = [
      { id: '1', url: 'https://a.com', dwellSeconds: 10, visitedAt: '2026-06-15T10:00:00Z', title: 'A' },
      { id: '2', url: 'https://b.com', dwellSeconds: 20, visitedAt: '2026-06-15T10:00:00Z', title: 'B' },
    ];
    const result = deduplicateVisits(visits);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateVisits([])).toEqual([]);
  });

  it('handles single visit', () => {
    const visits = [
      { id: '1', url: 'https://a.com', dwellSeconds: 10, visitedAt: '2026-06-15T10:00:00Z', title: 'A' },
    ];
    const result = deduplicateVisits(visits);
    expect(result).toHaveLength(1);
    expect(result[0].dwellSeconds).toBe(10);
  });

  it('keeps title from older entry if newer has no title', () => {
    const visits = [
      { id: '1', url: 'https://a.com', dwellSeconds: 10, visitedAt: '2026-06-15T10:00:00Z', title: 'Good Title' },
      { id: '2', url: 'https://a.com', dwellSeconds: 5, visitedAt: '2026-06-17T10:00:00Z', title: '' },
    ];
    const result = deduplicateVisits(visits);
    expect(result[0].title).toBe('Good Title');
  });

  it('handles three duplicates of the same URL', () => {
    const visits = [
      { id: '1', url: 'https://a.com', dwellSeconds: 10, visitedAt: '2026-06-15T10:00:00Z', title: 'A' },
      { id: '2', url: 'https://a.com', dwellSeconds: 20, visitedAt: '2026-06-16T10:00:00Z', title: 'A' },
      { id: '3', url: 'https://a.com', dwellSeconds: 30, visitedAt: '2026-06-17T10:00:00Z', title: 'A' },
    ];
    const result = deduplicateVisits(visits);
    expect(result).toHaveLength(1);
    expect(result[0].dwellSeconds).toBe(60);
    expect(result[0].visitedAt).toBe('2026-06-17T10:00:00Z');
  });
});

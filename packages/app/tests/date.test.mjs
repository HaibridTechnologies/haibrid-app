import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isOverdue, fmtDate, fmtDwell } from '../src/utils/date.js';

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for null/undefined due date', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOverdue('')).toBe(false);
  });

  it('returns true for a past date', () => {
    expect(isOverdue('2026-06-15')).toBe(true);
  });

  it('returns false for a future date', () => {
    expect(isOverdue('2026-06-20')).toBe(false);
  });

  it('returns false for today', () => {
    expect(isOverdue('2026-06-17')).toBe(false);
  });

  it('returns true for yesterday', () => {
    expect(isOverdue('2026-06-16')).toBe(true);
  });
});

describe('fmtDate', () => {
  it('returns empty string for falsy input', () => {
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(undefined)).toBe('');
    expect(fmtDate('')).toBe('');
  });

  it('formats an ISO date string', () => {
    const result = fmtDate('2026-04-08T14:30:00.000Z');
    expect(result).toMatch(/8/);
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/2026/);
  });

  it('formats a date-only string', () => {
    const result = fmtDate('2026-01-15');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2026/);
  });
});

describe('fmtDwell', () => {
  it('formats seconds under 60 as seconds', () => {
    expect(fmtDwell(5)).toBe('5s');
    expect(fmtDwell(59)).toBe('59s');
  });

  it('formats seconds between 60 and 3600 as minutes', () => {
    expect(fmtDwell(60)).toBe('1m');
    expect(fmtDwell(120)).toBe('2m');
    expect(fmtDwell(3599)).toBe('60m');
  });

  it('formats seconds >= 3600 as hours', () => {
    expect(fmtDwell(3600)).toBe('1.0h');
    expect(fmtDwell(7200)).toBe('2.0h');
    expect(fmtDwell(5400)).toBe('1.5h');
  });

  it('rounds minutes', () => {
    expect(fmtDwell(90)).toBe('2m');
    expect(fmtDwell(150)).toBe('3m');
  });

  it('formats 0 seconds', () => {
    expect(fmtDwell(0)).toBe('0s');
  });
});

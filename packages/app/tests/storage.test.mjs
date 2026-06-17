import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { updateIndex } = require('../lib/storage');

describe('updateIndex', () => {
  it('adds a link to new projects', () => {
    const index = {};
    updateIndex(index, 'link-1', [], ['proj-a', 'proj-b']);
    expect(index).toEqual({
      'proj-a': ['link-1'],
      'proj-b': ['link-1'],
    });
  });

  it('removes a link from old projects', () => {
    const index = { 'proj-a': ['link-1', 'link-2'], 'proj-b': ['link-1'] };
    updateIndex(index, 'link-1', ['proj-a', 'proj-b'], []);
    expect(index).toEqual({ 'proj-a': ['link-2'] });
    expect(index['proj-b']).toBeUndefined();
  });

  it('moves a link between projects', () => {
    const index = { 'proj-a': ['link-1'] };
    updateIndex(index, 'link-1', ['proj-a'], ['proj-b']);
    expect(index).toEqual({ 'proj-b': ['link-1'] });
    expect(index['proj-a']).toBeUndefined();
  });

  it('does not create duplicate entries', () => {
    const index = { 'proj-a': ['link-1'] };
    updateIndex(index, 'link-1', [], ['proj-a']);
    expect(index['proj-a']).toEqual(['link-1']);
    expect(index['proj-a'].length).toBe(1);
  });

  it('removes empty project keys from the index', () => {
    const index = { 'proj-a': ['link-1'] };
    updateIndex(index, 'link-1', ['proj-a'], []);
    expect(Object.keys(index)).toEqual([]);
  });

  it('handles no-op when both old and new are empty', () => {
    const index = { 'proj-a': ['link-2'] };
    updateIndex(index, 'link-1', [], []);
    expect(index).toEqual({ 'proj-a': ['link-2'] });
  });

  it('handles removing from a non-existent project gracefully', () => {
    const index = {};
    updateIndex(index, 'link-1', ['proj-nonexistent'], []);
    expect(index).toEqual({});
  });

  it('handles complex reassignment across multiple projects', () => {
    const index = {
      'proj-a': ['link-1', 'link-2'],
      'proj-b': ['link-1'],
      'proj-c': ['link-3'],
    };
    updateIndex(index, 'link-1', ['proj-a', 'proj-b'], ['proj-c', 'proj-d']);
    expect(index).toEqual({
      'proj-a': ['link-2'],
      'proj-c': ['link-3', 'link-1'],
      'proj-d': ['link-1'],
    });
    expect(index['proj-b']).toBeUndefined();
  });

  it('preserves other links in a project when removing one', () => {
    const index = { 'proj-a': ['link-1', 'link-2', 'link-3'] };
    updateIndex(index, 'link-2', ['proj-a'], []);
    expect(index['proj-a']).toEqual(['link-1', 'link-3']);
  });
});

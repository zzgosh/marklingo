import test from 'node:test';
import assert from 'node:assert/strict';
import { findYamlFrontmatterValueRanges } from '../out/translation/frontmatterValues.js';

function valuesFor(frontmatter) {
  return findYamlFrontmatterValueRanges(frontmatter).map((range) => frontmatter.slice(range.start, range.end));
}

test('finds selected human-facing YAML frontmatter scalar values', () => {
  const source = [
    '---',
    'name: codex-screen-recording',
    'title: Codex Screen Recording',
    'description: Record precise macOS screen evidence and perform scripted UI actions from Codex.',
    '---',
  ].join('\n');

  assert.deepEqual(valuesFor(source), [
    'Codex Screen Recording',
    'Record precise macOS screen evidence and perform scripted UI actions from Codex.',
  ]);
});

test('preserves unlisted fields, field names, quotes, comments, and non-language values', () => {
  const source = [
    '---',
    'name: "Codex Screen Recording" # extension identifier',
    "summary: 'Record precise macOS screen evidence'",
    'seoTitle: Screen recording workflow',
    'seo-description: Capture repeatable UI evidence',
    'draft: false',
    'count: 3',
    'published: 2026-06-02',
    'tags: [macos, recording]',
    '---',
  ].join('\n');

  assert.deepEqual(valuesFor(source), [
    'Record precise macOS screen evidence',
    'Screen recording workflow',
    'Capture repeatable UI evidence',
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPlaceholderTokens, protectMarkdown, restoreMarkdown } from '../out/translation/placeholders.js';

test('protects inline link destination when label contains the same URL', () => {
  const result = protectMarkdown('[https://example.com](https://example.com)', 'b0');

  assert.equal(result.text, '[https://example.com](__MDT_b0_URL_0__)');
  assert.equal(result.placeholders.__MDT_b0_URL_0__, 'https://example.com');
});

test('protects image destination when alt text contains the same URL', () => {
  const result = protectMarkdown('![https://img.example/a.png](https://img.example/a.png)', 'b0');

  assert.equal(result.text, '![https://img.example/a.png](__MDT_b0_IMG_0__)');
  assert.equal(result.placeholders.__MDT_b0_IMG_0__, 'https://img.example/a.png');
});

test('protects link destination before a repeated title value', () => {
  const result = protectMarkdown('[docs](https://example.com "https://example.com")', 'b0');

  assert.equal(result.text, '[docs](__MDT_b0_URL_0__ "https://example.com")');
  assert.equal(result.placeholders.__MDT_b0_URL_0__, 'https://example.com');
});

test('restores protected markdown tokens exactly', () => {
  const source = '`code` and [docs](https://example.com)';
  const protectedMarkdown = protectMarkdown(source, 'b0');
  const translated = protectedMarkdown.text.replace('and', '和');

  assert.equal(restoreMarkdown(translated, protectedMarkdown.placeholders), '`code` 和 [docs](https://example.com)');
});

test('compacts placeholder tokens while preserving restoration values', () => {
  const source = '`code` and [docs](https://example.com)';
  const protectedMarkdown = protectMarkdown(source, 'b0');
  const compacted = compactPlaceholderTokens(protectedMarkdown);

  assert.equal(compacted.text, '__M0__ and [docs](__M1__)');
  assert.equal(compacted.placeholders.__M0__, '`code`');
  assert.equal(compacted.placeholders.__M1__, 'https://example.com');
  assert.equal(restoreMarkdown('__M0__ 和 [docs](__M1__)', compacted.placeholders), '`code` 和 [docs](https://example.com)');
});

test('compacted placeholder aliases avoid tokens inside original protected values', () => {
  const protectedMarkdown = protectMarkdown('`literal __M0__ token` and `second`', 'b0');
  const compacted = compactPlaceholderTokens(protectedMarkdown);

  assert.equal(compacted.text, '__M1__ and __M2__');
  assert.deepEqual(compacted.placeholders, {
    __M1__: '`literal __M0__ token`',
    __M2__: '`second`',
  });
  assert.equal(restoreMarkdown('__M1__ 和 __M2__', compacted.placeholders), '`literal __M0__ token` 和 `second`');
});

test('skips placeholder parsing for plain text blocks', () => {
  const source = 'Plain translatable text without code, links, HTML, or images.';
  const protectedResult = protectMarkdown(source, 'b0');

  assert.equal(protectedResult.text, source);
  assert.deepEqual(protectedResult.placeholders, {});
});

test('protects indented code blocks inside blockquotes', () => {
  const source = '>     npm install marklingo';
  const protectedResult = protectMarkdown(source, 'b0');
  const placeholder = Object.keys(protectedResult.placeholders).find((key) => key.includes('CODEBLOCK'));

  assert.ok(placeholder);
  assert.match(protectedResult.text, /__MDT_b0_CODEBLOCK_0__/);
  assert.match(protectedResult.placeholders[placeholder], /npm install marklingo/);
});

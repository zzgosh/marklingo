import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPrivateTranslatedMarkdownFileName,
  getTargetLanguageSuffix,
  getTranslatedMarkdownFileName,
  getTranslationMetaFileName,
} from '../out/storage/outputNames.js';

test('uses stable suffixes for built-in target languages', () => {
  assert.equal(getTargetLanguageSuffix('简体中文'), 'zh-CN');
  assert.equal(getTargetLanguageSuffix('繁体中文'), 'zh-TW');
  assert.equal(getTargetLanguageSuffix('English'), 'en');
  assert.equal(getTargetLanguageSuffix('日本語'), 'ja');
});

test('derives safe suffixes for custom target languages', () => {
  assert.equal(getTargetLanguageSuffix('Portuguese (Brazil)'), 'portuguese-brazil');
  assert.equal(getTargetLanguageSuffix('  Italiano  '), 'italiano');
  assert.equal(getTargetLanguageSuffix('中文'), 'custom-72726d88');
  assert.equal(getTargetLanguageSuffix('粤语'), 'custom-3b0aa680');
  assert.equal(getTargetLanguageSuffix(''), 'custom');
});

test('builds translated output and metadata file names with language suffixes', () => {
  assert.equal(getTranslatedMarkdownFileName('guide', 'English'), 'guide_en_mdt.md');
  assert.equal(getPrivateTranslatedMarkdownFileName('guide', 'abc123', '简体中文'), 'guide_zh-CN_abc123_mdt.md');
  assert.equal(getTranslationMetaFileName('guide', 'abc123', '日本語'), 'guide_ja_abc123_mdt.meta.json');
});

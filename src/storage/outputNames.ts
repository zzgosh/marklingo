import { createHash } from 'node:crypto';

const TARGET_LANGUAGE_SUFFIXES = new Map<string, string>([
  ['简体中文', 'zh-CN'],
  ['繁体中文', 'zh-TW'],
  ['English', 'en'],
  ['日本語', 'ja'],
  ['한국어', 'ko'],
  ['Français', 'fr'],
  ['Español', 'es'],
  ['Deutsch', 'de'],
]);

export function getTargetLanguageSuffix(targetLanguage: string): string {
  const normalized = targetLanguage.trim();
  const known = TARGET_LANGUAGE_SUFFIXES.get(normalized);
  if (known) return known;

  const slug = normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 32)
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  if (!normalized) return 'custom';

  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 8);
  return `custom-${hash}`;
}

export function getTranslatedMarkdownFileName(sourceName: string, targetLanguage: string): string {
  return `${sourceName}_${getTargetLanguageSuffix(targetLanguage)}_mdt.md`;
}

export function getPrivateTranslatedMarkdownFileName(sourceName: string, sourceId: string, targetLanguage: string): string {
  return `${sourceName}_${getTargetLanguageSuffix(targetLanguage)}_${sourceId}_mdt.md`;
}

export function getTranslationMetaFileName(sourceName: string, sourceId: string, targetLanguage: string): string {
  return `${sourceName}_${getTargetLanguageSuffix(targetLanguage)}_${sourceId}_mdt.meta.json`;
}

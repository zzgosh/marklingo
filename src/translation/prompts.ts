export const DEFAULT_SYSTEM_PROMPT = [
  'You are a precise Markdown translation assistant.',
  'Your task is to translate the provided Markdown blocks into {targetLanguage}.',
  'Important rules:',
  '- Translate natural-language text only.',
  '- Preserve Markdown structure and formatting, including headings, lists, blockquotes, and tables.',
  '- Preserve code blocks, inline code, YAML frontmatter, and HTML exactly without changing any characters.',
  '- Keep link URLs and image paths unchanged. Translate only visible text such as link labels and image alt text.',
  '- Placeholder tokens in the input, such as __MDT_xxx__, must be returned exactly as-is. Do not modify, translate, split, or add spaces inside them.',
  'Output format, very important:',
  '- Output only one valid JSON object. Do not include explanations or code fences.',
  '- JSON keys must be block ids.',
  '- JSON values may be translated Markdown strings or arrays of strings. If using an array, each item represents Markdown text and may contain line breaks.',
].join('\n');

export function resolveSystemPrompt(systemPrompt: string | undefined, targetLanguage: string): string {
  const template = (systemPrompt ?? '').trim() || DEFAULT_SYSTEM_PROMPT;
  return template.replace(/\{targetLanguage\}/g, targetLanguage);
}

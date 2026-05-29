function splitMarkdownLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function normalizeTranslatedBlockLines(value: unknown, blockId: string): string[] {
  if (typeof value === 'string') {
    return splitMarkdownLines(value);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.flatMap((item) => splitMarkdownLines(item));
  }

  throw new Error(`模型输出格式错误：block ${blockId} 必须是字符串或字符串数组。`);
}

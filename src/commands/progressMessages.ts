export const TRANSLATION_PROGRESS_MESSAGES = {
  preparing: 'Preparing',
  cached: 'Using cached content',
  translating: 'Translating content',
  writing: 'Writing file',
} as const;

export function getBatchTranslationProgressMessage(fileIndex: number, totalFiles: number): string {
  return `File ${fileIndex + 1} of ${totalFiles}`;
}

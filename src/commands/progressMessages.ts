export const TRANSLATION_PROGRESS_MESSAGES = {
  prompting: 'Prompting',
  cached: 'Using saved translations',
  writing: 'Writing files',
} as const;

export function getTranslationRequestProgressMessage(requestIndex: number, totalRequests: number): string {
  return `Request ${requestIndex + 1} of ${totalRequests}`;
}

export function getBatchTranslationProgressMessage(fileIndex: number, totalFiles: number): string {
  return `File ${fileIndex + 1} of ${totalFiles}`;
}

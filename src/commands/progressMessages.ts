import { l10n } from '../localization.js';

export const TRANSLATION_PROGRESS_MESSAGES = {
  prompting: 'Prompting',
  cached: 'Using saved translations',
  writing: 'Writing files',
} as const;

export function getTranslationRequestProgressMessage(requestIndex: number, totalRequests: number): string {
  return l10n('Request {0} of {1}', requestIndex + 1, totalRequests);
}

export function getBatchTranslationProgressMessage(fileIndex: number, totalFiles: number): string {
  return l10n('File {0} of {1}', fileIndex + 1, totalFiles);
}

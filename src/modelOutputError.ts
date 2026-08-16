export const MODEL_OUTPUT_ERROR_CODE = 'MODEL_OUTPUT_INVALID';

export class ModelOutputError extends Error {
  readonly code = MODEL_OUTPUT_ERROR_CODE;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ModelOutputError';
  }
}

export function hasModelOutputErrorCode(error: unknown): error is Error & { code: typeof MODEL_OUTPUT_ERROR_CODE } {
  return error instanceof Error &&
    'code' in error &&
    error.code === MODEL_OUTPUT_ERROR_CODE;
}

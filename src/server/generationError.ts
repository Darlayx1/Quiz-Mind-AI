export class QuizGenerationError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = 'GENERATION_ERROR',
    public diagnosis?: string,
    public fingerprint?: string
  ) {
    super(message);
    this.name = 'QuizGenerationError';
  }
}

// Only retry diagnosed transport/provider failures or move to another eligible key.
export const isRetryableGenerationError = (error: QuizGenerationError) =>
  ['UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMIT_EXCEEDED', 'HIGH_DEMAND',
    'PROVIDER_INTERNAL_ERROR', 'NETWORK_ERROR', 'TIMEOUT', 'QUALITY_REJECTED'].includes(error.code);


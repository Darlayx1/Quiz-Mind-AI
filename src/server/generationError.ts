export class QuizGenerationError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = 'GENERATION_ERROR'
  ) {
    super(message);
    this.name = 'QuizGenerationError';
  }
}


export class JevShadowError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'JevShadowError';
    this.code = code;
  }
}

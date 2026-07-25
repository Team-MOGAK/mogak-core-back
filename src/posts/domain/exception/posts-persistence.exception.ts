export class PostsPersistenceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PostsPersistenceException';
  }
}

export class MogaksPersistenceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MogaksPersistenceException';
  }
}

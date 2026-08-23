/** Persistence data or results violate the Mogak domain's expected shape. */
export class MogakPersistenceException extends Error {
  static unsupportedValue(field: string, value: string): MogakPersistenceException {
    return new MogakPersistenceException(`Unsupported persisted ${field}: ${value}`);
  }

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MogakPersistenceException';
  }
}

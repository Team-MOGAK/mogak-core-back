/** Persistence data or results violate the Mogak domain's expected shape. */
export class MogakException extends Error {
  static unsupportedValue(field: string, value: string): MogakException {
    return new MogakException(`Unsupported persisted ${field}: ${value}`);
  }

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MogakException';
  }
}

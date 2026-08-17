/** Drizzle adapter가 영속성 결과를 해석할 수 없을 때 내보내는 실패다. */
export class MogakPersistenceException extends Error {
  static unsupportedValue(field: string, value: string): MogakPersistenceException {
    return new MogakPersistenceException(`Unsupported persisted ${field}: ${value}`);
  }

  constructor(message: string) {
    super(message);
    this.name = 'MogakPersistenceException';
  }
}

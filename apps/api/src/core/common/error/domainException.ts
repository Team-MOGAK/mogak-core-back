export class DomainException extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DomainException';
  }
}

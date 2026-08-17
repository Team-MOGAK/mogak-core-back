import type { DomainErrorCode as DomainErrorCodeValue } from './domainErrorCode';

export { DomainErrorCode } from './domainErrorCode';

export class DomainException extends Error {
  constructor(readonly code: DomainErrorCodeValue) {
    super(code);
    this.name = 'DomainException';
  }
}

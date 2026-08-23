export class AuthPersistenceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthPersistenceException';
  }
}

export class DuplicateEmailException extends AuthPersistenceException {
  constructor() {
    super('Duplicate email constraint violation');
    this.name = 'DuplicateEmailException';
  }
}

export class DuplicateSocialAccountException extends AuthPersistenceException {
  constructor() {
    super('Duplicate social account constraint violation');
    this.name = 'DuplicateSocialAccountException';
  }
}

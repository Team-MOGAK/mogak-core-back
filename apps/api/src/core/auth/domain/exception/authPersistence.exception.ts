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

export class SessionUserNotFoundAfterLockException extends AuthPersistenceException {
  constructor() {
    super('User did not exist after acquiring the user lock for session creation');
    this.name = 'SessionUserNotFoundAfterLockException';
  }
}

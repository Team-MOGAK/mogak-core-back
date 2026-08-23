export class UserPersistenceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UserPersistenceException';
  }
}

export class DuplicateNicknameException extends UserPersistenceException {
  constructor() {
    super('Duplicate nickname constraint violation');
    this.name = 'DuplicateNicknameException';
  }
}

export class ConsentUserNotFoundAfterLockException extends UserPersistenceException {
  constructor() {
    super('User did not exist after acquiring the user lock for consent update');
    this.name = 'ConsentUserNotFoundAfterLockException';
  }
}

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

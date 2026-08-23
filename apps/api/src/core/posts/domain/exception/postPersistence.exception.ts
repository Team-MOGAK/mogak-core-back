export class PostPersistenceException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PostPersistenceException';
  }
}

/** A pre-checked post/user disappeared while waiting for its advisory lock. */
export class PostNotFoundAfterLockException extends Error {
  constructor(readonly resource: 'POST' | 'JOGAK' | 'USER') {
    super(`${resource.toLowerCase()} disappeared while acquiring advisory lock`);
    this.name = 'PostNotFoundAfterLockException';
  }
}

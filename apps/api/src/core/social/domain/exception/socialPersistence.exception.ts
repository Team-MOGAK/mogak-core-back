export class SocialUserNotFoundAfterLockException extends Error {
  constructor() {
    super('follow actor or target disappeared while acquiring advisory lock');
    this.name = 'SocialUserNotFoundAfterLockException';
  }
}

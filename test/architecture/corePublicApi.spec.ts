import {
  AuthService,
  MogakService,
  PostService,
  SocialService,
  STORAGE_PORT,
  UserService,
} from '@mogak/core';

describe('core public API', () => {
  it('exposes services and ports needed by another application', () => {
    expect(AuthService).toBeDefined();
    expect(MogakService).toBeDefined();
    expect(PostService).toBeDefined();
    expect(SocialService).toBeDefined();
    expect(UserService).toBeDefined();
    expect(STORAGE_PORT).toBeDefined();
  });
});

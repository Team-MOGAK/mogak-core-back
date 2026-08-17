import type { ConfigService } from '@nestjs/config';

import { AppleIdentityVerifier } from '../../../apps/api/src/infrastructure/auth/verifier/appleIdentityVerifier';
import { GoogleIdentityVerifier } from '../../../apps/api/src/infrastructure/auth/verifier/googleIdentityVerifier';
import { testMock } from '../../testMock';

function clientIdsOf(verifier: object): string[] {
  return (verifier as { clientIds: string[] }).clientIds;
}

describe('소셜 verifier 환경변수 호환', () => {
  it('Apple은 복수형 키를 우선하고 기존 단수형 키를 대체로 받는다', () => {
    const pluralConfig = {
      get: testMock().mockReturnValue('com.mogak.ios, com.mogak.web'),
      getOrThrow: testMock(),
    } as unknown as ConfigService;
    const singularConfig = {
      get: testMock().mockReturnValue(undefined),
      getOrThrow: testMock().mockReturnValue('com.mogak.ios'),
    } as unknown as ConfigService;

    expect(clientIdsOf(new AppleIdentityVerifier(pluralConfig))).toEqual([
      'com.mogak.ios',
      'com.mogak.web',
    ]);
    expect(clientIdsOf(new AppleIdentityVerifier(singularConfig))).toEqual(['com.mogak.ios']);
  });

  it('Google은 복수형 키를 우선하고 기존 단수형 키를 대체로 받는다', () => {
    const pluralConfig = {
      get: testMock().mockReturnValue('mogak-ios,mogak-web'),
      getOrThrow: testMock(),
    } as unknown as ConfigService;
    const singularConfig = {
      get: testMock().mockReturnValue(undefined),
      getOrThrow: testMock().mockReturnValue('mogak-web'),
    } as unknown as ConfigService;

    expect(clientIdsOf(new GoogleIdentityVerifier(pluralConfig))).toEqual([
      'mogak-ios',
      'mogak-web',
    ]);
    expect(clientIdsOf(new GoogleIdentityVerifier(singularConfig))).toEqual(['mogak-web']);
  });
});

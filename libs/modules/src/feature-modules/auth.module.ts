import { Module } from '@nestjs/common';

import { DatabaseModule } from '@infra/database/database.module';
import { AUTH_PERSISTENCE } from '@core/auth/application/port/authPersistence.port';
import { AUTH_TOKEN_VERIFIER } from '@core/auth/application/port/authTokenVerifier.port';
import { SESSION_TOKEN_ISSUER } from '@core/auth/application/port/sessionTokenIssuer.port';
import { SOCIAL_IDENTITY_VERIFIER } from '@core/auth/application/port/socialIdentityVerifier.port';
import { AuthService } from '@core/auth/application/service/auth.service';
import { AuthRepository } from '@infra/auth/repository/auth.repository';
import { JwtTokenService } from '@infra/auth/service/token.service';
import { AppleIdentityVerifier } from '@infra/auth/verifier/appleIdentityVerifier';
import { GoogleIdentityVerifier } from '@infra/auth/verifier/googleIdentityVerifier';
import { KakaoIdentityVerifier } from '@infra/auth/verifier/kakaoIdentityVerifier';
import { SocialIdentityVerifierRegistry } from '@infra/auth/verifier/socialIdentityVerifier.registry';

@Module({
  imports: [DatabaseModule],
  providers: [
    JwtTokenService,
    AuthRepository,
    AppleIdentityVerifier,
    GoogleIdentityVerifier,
    KakaoIdentityVerifier,
    {
      provide: AUTH_PERSISTENCE,
      useExisting: AuthRepository,
    },
    {
      provide: SESSION_TOKEN_ISSUER,
      useExisting: JwtTokenService,
    },
    {
      provide: AUTH_TOKEN_VERIFIER,
      useExisting: JwtTokenService,
    },
    {
      provide: SOCIAL_IDENTITY_VERIFIER,
      inject: [AppleIdentityVerifier, GoogleIdentityVerifier, KakaoIdentityVerifier],
      useFactory: (
        apple: AppleIdentityVerifier,
        google: GoogleIdentityVerifier,
        kakao: KakaoIdentityVerifier,
      ): SocialIdentityVerifierRegistry =>
        new SocialIdentityVerifierRegistry([apple, google, kakao]),
    },
    {
      provide: AuthService,
      inject: [
        SOCIAL_IDENTITY_VERIFIER,
        AUTH_PERSISTENCE,
        SESSION_TOKEN_ISSUER,
        AUTH_TOKEN_VERIFIER,
      ],
      useFactory: (identityVerifier, persistence, tokenIssuer, tokenVerifier) =>
        new AuthService(identityVerifier, persistence, tokenIssuer, tokenVerifier),
    },
  ],
  exports: [SESSION_TOKEN_ISSUER, AuthService],
})
export class AuthModule {}

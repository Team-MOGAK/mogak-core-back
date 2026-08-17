import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AUTH_PERSISTENCE } from '../../core/auth/application/port/authPersistence.port';
import { AUTH_TOKEN_VERIFIER } from '../../core/auth/application/port/authTokenVerifier.port';
import { SESSION_TOKEN_ISSUER } from '../../core/auth/application/port/sessionTokenIssuer.port';
import { SOCIAL_IDENTITY_VERIFIER } from '../../core/auth/application/port/socialIdentityVerifier.port';
import { AuthService } from '../../core/auth/application/service/auth.service';
import { AuthRepository } from '../../infrastructure/auth/repository/auth.repository';
import { JwtTokenService } from '../../infrastructure/auth/service/token.service';
import { AppleIdentityVerifier } from '../../infrastructure/auth/verifier/appleIdentityVerifier';
import { GoogleIdentityVerifier } from '../../infrastructure/auth/verifier/googleIdentityVerifier';
import { KakaoIdentityVerifier } from '../../infrastructure/auth/verifier/kakaoIdentityVerifier';
import { SocialIdentityVerifierRegistry } from '../../infrastructure/auth/verifier/socialIdentityVerifier.registry';
import { AccessTokenGuard } from '../../api/auth/presentation/controller/accessToken.guard';
import { AuthController } from '../../api/auth/presentation/controller/auth.controller';
import { RegisteredUserGuard } from '../../api/auth/presentation/controller/registeredUser.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
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
    AccessTokenGuard,
    RegisteredUserGuard,
  ],
  exports: [SESSION_TOKEN_ISSUER, AuthService, AccessTokenGuard, RegisteredUserGuard],
})
export class AuthModule {}

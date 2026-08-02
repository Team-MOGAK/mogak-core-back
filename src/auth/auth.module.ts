import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AUTH_PERSISTENCE } from './application/port/authPersistence.port';
import { AUTH_TOKEN_VERIFIER } from './application/port/authTokenVerifier.port';
import { SESSION_TOKEN_ISSUER } from './application/port/sessionTokenIssuer.port';
import { SOCIAL_IDENTITY_VERIFIER } from './application/port/socialIdentityVerifier.port';
import { AuthService } from './application/service/auth.service';
import { AuthRepository } from './infrastructure/repository/auth.repository';
import { JwtTokenService } from './infrastructure/service/token.service';
import { AppleIdentityVerifier } from './infrastructure/verifier/appleIdentityVerifier';
import { GoogleIdentityVerifier } from './infrastructure/verifier/googleIdentityVerifier';
import { KakaoIdentityVerifier } from './infrastructure/verifier/kakaoIdentityVerifier';
import { SocialIdentityVerifierRegistry } from './infrastructure/verifier/socialIdentityVerifier.registry';
import { AccessTokenGuard } from './presentation/controller/accessToken.guard';
import { AuthController } from './presentation/controller/auth.controller';
import { RegisteredUserGuard } from './presentation/controller/registeredUser.guard';

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
    AuthService,
    AccessTokenGuard,
    RegisteredUserGuard,
  ],
  exports: [SESSION_TOKEN_ISSUER, AuthService, AccessTokenGuard, RegisteredUserGuard],
})
export class AuthModule {}

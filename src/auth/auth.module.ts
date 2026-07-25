import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AUTH_PERSISTENCE } from './application/port/auth-persistence.port';
import { SOCIAL_IDENTITY_VERIFIER } from './application/port/social-identity-verifier.port';
import { TOKEN_ISSUER } from './application/port/token-issuer.port';
import { AuthService, SESSION_ID_GENERATOR } from './application/service/auth.service';
import { DrizzleAuthRepository } from './infrastructure/repository/auth.repository';
import { TokenService } from './infrastructure/service/token.service';
import { AppleIdentityVerifier } from './infrastructure/verifier/apple-identity-verifier';
import { GoogleIdentityVerifier } from './infrastructure/verifier/google-identity-verifier';
import { KakaoIdentityVerifier } from './infrastructure/verifier/kakao-identity-verifier';
import { SocialIdentityVerifierRegistry } from './infrastructure/verifier/social-identity-verifier.registry';
import { AccessTokenGuard } from './presentation/controller/access-token.guard';
import { AuthController } from './presentation/controller/auth.controller';
import { RegisteredUserGuard } from './presentation/controller/registered-user.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    TokenService,
    DrizzleAuthRepository,
    AppleIdentityVerifier,
    GoogleIdentityVerifier,
    KakaoIdentityVerifier,
    {
      provide: AUTH_PERSISTENCE,
      useExisting: DrizzleAuthRepository,
    },
    {
      provide: TOKEN_ISSUER,
      useExisting: TokenService,
    },
    {
      provide: SESSION_ID_GENERATOR,
      useValue: randomUUID,
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
  exports: [
    TokenService,
    AuthService,
    AccessTokenGuard,
    RegisteredUserGuard,
  ],
})
export class AuthModule {}

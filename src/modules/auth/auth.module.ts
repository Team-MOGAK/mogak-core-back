import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AUTH_PERSISTENCE, AuthService, SESSION_ID_GENERATOR } from './application/auth.service';
import { DrizzleAuthPersistence } from './infrastructure/auth.persistence';
import { AuthSessionsRepository } from './infrastructure/auth-sessions.repository';
import { AppleIdentityVerifier } from './infrastructure/apple-identity-verifier';
import { GoogleIdentityVerifier } from './infrastructure/google-identity-verifier';
import { KakaoIdentityVerifier } from './infrastructure/kakao-identity-verifier';
import {
  SOCIAL_IDENTITY_VERIFIER_REGISTRY,
  SocialIdentityVerifierRegistry,
} from './infrastructure/social-identity-verifier.registry';
import { TokenService } from './infrastructure/token.service';
import { AccessTokenGuard } from './presentation/access-token.guard';
import { AuthController } from './presentation/auth.controller';
import { RegisteredUserGuard } from './presentation/registered-user.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    TokenService,
    AuthSessionsRepository,
    DrizzleAuthPersistence,
    AppleIdentityVerifier,
    GoogleIdentityVerifier,
    KakaoIdentityVerifier,
    {
      provide: AUTH_PERSISTENCE,
      useExisting: DrizzleAuthPersistence,
    },
    {
      provide: SESSION_ID_GENERATOR,
      useValue: randomUUID,
    },
    {
      provide: SOCIAL_IDENTITY_VERIFIER_REGISTRY,
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
    AuthSessionsRepository,
    AuthService,
    AccessTokenGuard,
    RegisteredUserGuard,
  ],
})
export class AuthModule {}

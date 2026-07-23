import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { requiredTrimmed } from '../../../common/validation/required-text';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user';
import { TokenService } from '../../auth/infrastructure/token.service';
import { ConsentService, type ConsentCommand } from './consent.service';
import { UserRepository } from '../infrastructure/user.repository';
import { STORAGE_PORT, type StoragePort } from '../../storage/application/storage.port';

const SESSION_ID_GENERATOR = Symbol('USER_SESSION_ID_GENERATOR');
const REFRESH_TOKEN_TTL_MILLISECONDS = 31 * 24 * 60 * 60 * 1_000;

export type JoinInput = Readonly<{
  nickname: string;
  job: string;
  address: string;
  consents: readonly ConsentCommand[];
}>;

@Injectable()
export class UserService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(SESSION_ID_GENERATOR) private readonly createSessionId: () => string = randomUUID,
  ) {}

  async verifyNickname(nickname: string): Promise<void> {
    if (await this.users.existsByNickname(requiredTrimmed(nickname))) {
      throw new AppException(AppErrorCode.INVALID_NICKNAME);
    }
  }

  async join(current: AuthenticatedUser, input: JoinInput) {
    const user = await this.users.findById(current.userId);
    if (user === null) throw new AppException(AppErrorCode.USER_NOT_FOUND);
    if (current.role !== 'PENDING' || user.role !== 'PENDING') {
      throw new AppException(AppErrorCode.USER_ALREADY_EXISTS);
    }
    const nickname = requiredTrimmed(input.nickname);
    const jobName = requiredTrimmed(input.job);
    const addressName = requiredTrimmed(input.address);
    await this.verifyNickname(nickname);
    const [job, address] = await Promise.all([
      this.users.findJobByName(jobName),
      this.users.findAddressByName(addressName),
    ]);
    if (job === null) throw new AppException(AppErrorCode.JOB_NOT_FOUND);
    if (address === null) throw new AppException(AppErrorCode.ADDRESS_NOT_FOUND);
    await this.consents.validate(input.consents);

    const sessionId = this.createSessionId();
    const tokens = await this.tokens.issue({
      userId: user.id,
      role: 'USER',
      sessionId,
      ...(user.email === null ? {} : { email: user.email }),
    });
    const now = new Date();
    try {
      const registered = await this.users.completeRegistration({
        userId: user.id,
        nickname,
        jobId: job.id,
        addressId: address.id,
        consents: input.consents,
        currentSessionId: current.sessionId,
        replacementSession: {
          id: sessionId,
          refreshTokenHash: this.tokens.hashRefreshToken(tokens.refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MILLISECONDS),
        },
        now,
      });
      return { userId: registered.id, nickname: registered.nickname, tokens };
    } catch (error: unknown) {
      if (isNicknameUniqueViolation(error)) {
        throw new AppException(AppErrorCode.INVALID_NICKNAME);
      }
      throw error;
    }
  }

  async profile(userId: number) {
    const profile = await this.users.findProfile(userId);
    if (profile === null) throw new AppException(AppErrorCode.USER_NOT_FOUND);
    return {
      nickname: profile.nickname,
      job: profile.job,
      imgUrl:
        profile.profileImageKey === null
          ? null
          : await this.storage.resolvePublicUrl(profile.profileImageKey),
    };
  }

  async updateNickname(userId: number, nickname: string): Promise<void> {
    const normalizedNickname = requiredTrimmed(nickname);
    await this.verifyNickname(normalizedNickname);
    try {
      if (!(await this.users.updateNickname(userId, normalizedNickname, new Date()))) {
        throw new AppException(AppErrorCode.USER_NOT_FOUND);
      }
    } catch (error: unknown) {
      if (isNicknameUniqueViolation(error)) {
        throw new AppException(AppErrorCode.INVALID_NICKNAME);
      }
      throw error;
    }
  }

  async updateJob(userId: number, jobName: string): Promise<void> {
    const job = await this.users.findJobByName(requiredTrimmed(jobName));
    if (job === null) throw new AppException(AppErrorCode.JOB_NOT_FOUND);
    if (!(await this.users.updateJob(userId, job.id, new Date()))) {
      throw new AppException(AppErrorCode.USER_NOT_FOUND);
    }
  }

  async updateProfileImage(userId: number, file: Express.Multer.File | undefined): Promise<void> {
    const profile = await this.users.findProfile(userId);
    if (profile === null) throw new AppException(AppErrorCode.USER_NOT_FOUND);
    const now = new Date();
    if (file !== undefined && file.size > 0) {
      const uploaded = await this.storage.replaceProfile(profile.profileImageKey, file);
      if (!(await this.users.updateProfileImageKey(userId, uploaded.storageKey, now))) {
        throw new AppException(AppErrorCode.USER_NOT_FOUND);
      }
      return;
    }
    if (profile.profileImageKey !== null) {
      await this.storage.deleteProfile(profile.profileImageKey);
    }
    if (!(await this.users.updateProfileImageKey(userId, null, now))) {
      throw new AppException(AppErrorCode.USER_NOT_FOUND);
    }
  }
}

function isNicknameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'users_nickname_unique'
  );
}

export { SESSION_ID_GENERATOR };

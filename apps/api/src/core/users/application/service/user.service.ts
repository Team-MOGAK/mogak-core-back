import { DomainException } from '@core/common/error/domainException';
import { generateId } from '@core/common/util/idGenerator';

import type { AuthenticatedPrincipal } from '@core/auth/application/type/authenticatedPrincipal';
import type { SessionTokenIssuerPort } from '@core/auth/application/port/sessionTokenIssuer.port';
import { requiredTrimmed } from '@core/common/validation/requiredText';
import type { BinaryUpload, StoragePort } from '@core/storage/application/storage.port';
import {
  canCompleteRegistration,
  normalizeNickname,
} from '../../domain/policy/userRegistration.policy';
import { DuplicateNicknameException } from '../../domain/exception/userPersistence.exception';
import type { MetadataRepositoryPort } from '../port/metadata.repository.port';
import type { UserRepositoryPort } from '../port/user.repository.port';
import type { JoinUserCommand } from '../type/user.command';
import type { JoinUserResult, UserProfileResult } from '../type/user.result';
import type { ConsentService } from './consent.service';

export class UserService {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly metadata: MetadataRepositoryPort,
    private readonly consents: ConsentService,
    private readonly sessionTokenIssuer: SessionTokenIssuerPort,
    private readonly storage: StoragePort,
  ) {}

  async verifyNickname(nickname: string): Promise<void> {
    const normalized = requiredNickname(nickname);
    if (await this.users.existsByNickname(normalized)) {
      throw new DomainException('INVALID_NICKNAME');
    }
  }

  async join(current: AuthenticatedPrincipal, command: JoinUserCommand): Promise<JoinUserResult> {
    const user = await this.users.findById(current.userId);
    if (user === null) throw new DomainException('USER_NOT_FOUND');
    if (!canCompleteRegistration(current.role, user.role)) {
      throw new DomainException('USER_ALREADY_EXISTS');
    }
    const nickname = requiredNickname(command.nickname);
    const jobName = requiredTrimmed(command.job);
    const addressName = requiredTrimmed(command.address);
    await this.verifyNickname(nickname);
    const [job, address] = await Promise.all([
      this.metadata.findJobByName(jobName),
      this.metadata.findAddressByName(addressName),
    ]);
    if (job === null) throw new DomainException('JOB_NOT_FOUND');
    if (address === null) throw new DomainException('ADDRESS_NOT_FOUND');
    await this.consents.validate(command.consents);

    const sessionId = generateId();
    const issuedTokens = await this.sessionTokenIssuer.issue({
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
        consents: command.consents,
        currentSessionId: current.sessionId,
        replacementSession: {
          id: sessionId,
          refreshTokenHash: issuedTokens.refreshTokenHash,
          expiresAt: issuedTokens.refreshTokenExpiresAt,
        },
        now,
      });
      return {
        userId: registered.id,
        nickname: registered.nickname,
        tokens: {
          accessToken: issuedTokens.accessToken,
          refreshToken: issuedTokens.refreshToken,
        },
      };
    } catch (error: unknown) {
      if (error instanceof DuplicateNicknameException) {
        throw new DomainException('INVALID_NICKNAME');
      }
      throw error;
    }
  }

  async profile(userId: number): Promise<UserProfileResult> {
    const profile = await this.users.findProfile(userId);
    if (profile === null) throw new DomainException('USER_NOT_FOUND');
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
    const normalizedNickname = requiredNickname(nickname);
    await this.verifyNickname(normalizedNickname);
    try {
      if (
        !(await this.users.updateNickname({
          userId,
          nickname: normalizedNickname,
          now: new Date(),
        }))
      ) {
        throw new DomainException('USER_NOT_FOUND');
      }
    } catch (error: unknown) {
      if (error instanceof DuplicateNicknameException) {
        throw new DomainException('INVALID_NICKNAME');
      }
      throw error;
    }
  }

  async updateJob(userId: number, jobName: string): Promise<void> {
    const job = await this.metadata.findJobByName(requiredTrimmed(jobName));
    if (job === null) throw new DomainException('JOB_NOT_FOUND');
    if (!(await this.users.updateJob({ userId, jobId: job.id, now: new Date() }))) {
      throw new DomainException('USER_NOT_FOUND');
    }
  }

  async updateProfileImage(userId: number, file: BinaryUpload | undefined): Promise<void> {
    const profile = await this.users.findProfile(userId);
    if (profile === null) throw new DomainException('USER_NOT_FOUND');
    const now = new Date();
    if (file !== undefined && file.size > 0) {
      const uploaded = await this.storage.replaceProfile(profile.profileImageKey, file);
      if (
        !(await this.users.updateProfileImageKey({
          userId,
          profileImageKey: uploaded.storageKey,
          now,
        }))
      ) {
        throw new DomainException('USER_NOT_FOUND');
      }
      return;
    }
    if (profile.profileImageKey !== null) await this.storage.deleteProfile(profile.profileImageKey);
    if (!(await this.users.updateProfileImageKey({ userId, profileImageKey: null, now }))) {
      throw new DomainException('USER_NOT_FOUND');
    }
  }
}

function requiredNickname(value: string): string {
  const normalized = normalizeNickname(value);
  if (normalized === null) throw new DomainException('INVALID_PARAMETER');
  return normalized;
}

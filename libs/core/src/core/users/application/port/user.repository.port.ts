import type {
  CompleteRegistrationCommand,
  ReplaceSessionCommand,
  UpdateJobCommand,
  UpdateNicknameCommand,
  UpdateProfileImageCommand,
} from '../type/user.command';
import type { RegistrationCandidate, UserProfileProjection } from '../type/user.result';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  existsByNickname(nickname: string): Promise<boolean>;
  findById(userId: number): Promise<RegistrationCandidate | null>;
  findProfile(userId: number): Promise<UserProfileProjection | null>;
  completeRegistration(
    command: CompleteRegistrationCommand,
  ): Promise<Readonly<{ id: number; nickname: string }>>;
  replaceSession(command: ReplaceSessionCommand): Promise<void>;
  updateNickname(command: UpdateNicknameCommand): Promise<boolean>;
  updateJob(command: UpdateJobCommand): Promise<boolean>;
  updateProfileImageKey(command: UpdateProfileImageCommand): Promise<boolean>;
}

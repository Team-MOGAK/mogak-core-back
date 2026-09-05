import type { ConsentAgreementCommand } from './consent.command';

export type JoinUserCommand = Readonly<{
  nickname: string;
  job: string;
  address: string;
  consents: readonly ConsentAgreementCommand[];
}>;

export type CompleteRegistrationCommand = Readonly<{
  userId: number;
  nickname: string;
  jobId: number;
  addressId: number;
  consents: readonly ConsentAgreementCommand[];
  currentSessionId: string;
  replacementSession: Readonly<{
    id: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }>;
  now: Date;
}>;

export type ReplaceSessionCommand = Readonly<{
  userId: number;
  currentSessionId: string;
  replacementSession: Readonly<{
    id: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }>;
}>;

export type UpdateNicknameCommand = Readonly<{ userId: number; nickname: string; now: Date }>;
export type UpdateJobCommand = Readonly<{ userId: number; jobId: number; now: Date }>;
export type UpdateProfileImageCommand = Readonly<{
  userId: number;
  profileImageKey: string | null;
  now: Date;
}>;

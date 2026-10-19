import { AuthErrorCode } from '../../auth/domain/authErrorCode';
import { CommonErrorCode } from './commonErrorCode';
import { MogakErrorCode } from '../../mogaks/domain/mogakErrorCode';
import { PostErrorCode } from '../../posts/domain/postErrorCode';
import { UserErrorCode } from '../../users/domain/userErrorCode';

/** Aggregate used by cross-domain boundaries such as API error translation. */
export const DomainErrorCode = {
  ...AuthErrorCode,
  ...CommonErrorCode,
  ...MogakErrorCode,
  ...PostErrorCode,
  ...UserErrorCode,
} as const;

export type DomainErrorCode = (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

import { AuthAppErrorCode } from './error/authAppErrorCode';
import { CommonAppErrorCode } from './error/commonAppErrorCode';
import { MogakAppErrorCode } from './error/mogakAppErrorCode';
import { PostAppErrorCode } from './error/postAppErrorCode';
import { UserAppErrorCode } from './error/userAppErrorCode';

export { type ErrorDefinition } from './error/errorDefinition';

/** Cross-cutting view used where API metadata for every error is required. */
export const AppErrorCode = {
  ...AuthAppErrorCode,
  ...CommonAppErrorCode,
  ...MogakAppErrorCode,
  ...PostAppErrorCode,
  ...UserAppErrorCode,
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

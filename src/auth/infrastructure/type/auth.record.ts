import type { authSessions, socialAccounts } from '../../../database/schema';

export type AuthSessionRecord = typeof authSessions.$inferSelect;
export type SocialAccountRecord = typeof socialAccounts.$inferSelect;

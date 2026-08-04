import type {
  ConsentAgreementCommand,
  UpdateMarketingConsentCommand,
} from '../type/consent.command';
import type { ConsentItemState, MarketingConsentResult } from '../type/consent.result';

export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');

export interface ConsentRepositoryPort {
  listActiveItems(): Promise<ConsentItemState[]>;
  findItemsByIds(ids: readonly number[]): Promise<ConsentItemState[]>;
  upsertUserConsents(
    userId: number,
    commands: readonly ConsentAgreementCommand[],
    now: Date,
  ): Promise<void>;
  getMarketingConsents(userId: number): Promise<MarketingConsentResult>;
  updateMarketingConsents(
    userId: number,
    command: UpdateMarketingConsentCommand,
    now: Date,
  ): Promise<MarketingConsentResult>;
}

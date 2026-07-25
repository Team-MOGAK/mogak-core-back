import type {
  ConsentAgreementCommand,
  UpdateMarketingConsentCommand,
} from '../type/consent.command';
import type { MarketingConsentResult } from '../type/consent.result';
import type { ConsentItem } from '../../domain/entity/consent.entity';

export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');

export interface ConsentRepositoryPort {
  listActiveItems(): Promise<ConsentItem[]>;
  findItemsByIds(ids: readonly number[]): Promise<ConsentItem[]>;
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

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import {
  validateConsentSelections,
  type ConsentValidationIssue,
} from '../../domain/policy/consent.policy';
import type { ConsentRepositoryPort } from '../port/consent.repository.port';
import type {
  ConsentAgreementCommand,
  UpdateMarketingConsentCommand,
} from '../type/consent.command';
import type { ConsentItemResult, MarketingConsentResult } from '../type/consent.result';
import { ConsentUserNotFoundAfterLockException } from '../../domain/exception/userPersistence.exception';

export class ConsentService {
  constructor(private readonly repository: ConsentRepositoryPort) {}

  async listActive(): Promise<ConsentItemResult[]> {
    return (await this.repository.listActiveItems()).map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      required: item.required,
    }));
  }

  async validate(commands: readonly ConsentAgreementCommand[]): Promise<void> {
    const ids = commands.map((command) => command.consentItemId);
    if (new Set(ids).size !== ids.length) {
      this.throwForValidationIssue('DUPLICATE_CONSENT_ITEM');
    }
    const [selected, active] = await Promise.all([
      this.repository.findItemsByIds(ids),
      this.repository.listActiveItems(),
    ]);
    if (selected.length !== ids.length) {
      throw new DomainException(DomainErrorCode.CONSENT_ITEM_NOT_FOUND);
    }
    const issue = validateConsentSelections(commands, [...selected, ...active]);
    if (issue !== null) this.throwForValidationIssue(issue);
  }

  async update(userId: number, commands: readonly ConsentAgreementCommand[]): Promise<void> {
    await this.validate(commands);
    try {
      await this.repository.upsertUserConsents(userId, commands, new Date());
    } catch (error: unknown) {
      this.throwUserNotFoundAfterLock(error);
    }
  }

  async getMarketing(userId: number): Promise<MarketingConsentResult> {
    return this.repository.getMarketingConsents(userId);
  }

  async updateMarketing(
    userId: number,
    command: UpdateMarketingConsentCommand,
  ): Promise<MarketingConsentResult> {
    if (command.marketingAgreed === undefined && command.advertisementAgreed === undefined) {
      throw new DomainException(DomainErrorCode.INVALID_PARAMETER);
    }
    try {
      return await this.repository.updateMarketingConsents(userId, command, new Date());
    } catch (error: unknown) {
      this.throwUserNotFoundAfterLock(error);
    }
  }

  private throwUserNotFoundAfterLock(error: unknown): never {
    if (error instanceof ConsentUserNotFoundAfterLockException) {
      throw new DomainException(DomainErrorCode.USER_NOT_FOUND);
    }
    throw error;
  }

  private throwForValidationIssue(issue: ConsentValidationIssue): never {
    const errorCode = (
      {
        DUPLICATE_CONSENT_ITEM: 'DUPLICATE_CONSENT_ITEM',
        CONSENT_ITEM_INACTIVE: 'CONSENT_ITEM_INACTIVE',
        REQUIRED_CONSENT_NOT_AGREED: 'INVALID_PARAMETER',
      } as const
    )[issue];
    throw new DomainException(errorCode);
  }
}

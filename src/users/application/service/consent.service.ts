import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/appErrorCode';
import { DomainException } from '../../../common/domain.exception';
import {
  validateConsentSelections,
  type ConsentValidationIssue,
} from '../../domain/policy/consent.policy';
import { CONSENT_REPOSITORY, type ConsentRepositoryPort } from '../port/consent.repository.port';
import type {
  ConsentAgreementCommand,
  UpdateMarketingConsentCommand,
} from '../type/consent.command';
import type { ConsentItemResult, MarketingConsentResult } from '../type/consent.result';

@Injectable()
export class ConsentService {
  constructor(@Inject(CONSENT_REPOSITORY) private readonly repository: ConsentRepositoryPort) {}

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
      throw new DomainException(AppErrorCode.CONSENT_ITEM_NOT_FOUND);
    }
    const issue = validateConsentSelections(commands, [...selected, ...active]);
    if (issue !== null) this.throwForValidationIssue(issue);
  }

  async update(userId: number, commands: readonly ConsentAgreementCommand[]): Promise<void> {
    await this.validate(commands);
    await this.repository.upsertUserConsents(userId, commands, new Date());
  }

  async getMarketing(userId: number): Promise<MarketingConsentResult> {
    return this.repository.getMarketingConsents(userId);
  }

  async updateMarketing(
    userId: number,
    command: UpdateMarketingConsentCommand,
  ): Promise<MarketingConsentResult> {
    if (command.marketingAgreed === undefined && command.advertisementAgreed === undefined) {
      throw new DomainException(AppErrorCode.INVALID_PARAMETER);
    }
    return this.repository.updateMarketingConsents(userId, command, new Date());
  }

  private throwForValidationIssue(issue: ConsentValidationIssue): never {
    const errorCode = {
      DUPLICATE_CONSENT_ITEM: AppErrorCode.DUPLICATE_CONSENT_ITEM,
      CONSENT_ITEM_INACTIVE: AppErrorCode.CONSENT_ITEM_INACTIVE,
      REQUIRED_CONSENT_NOT_AGREED: AppErrorCode.INVALID_PARAMETER,
    }[issue];
    throw new DomainException(errorCode);
  }
}

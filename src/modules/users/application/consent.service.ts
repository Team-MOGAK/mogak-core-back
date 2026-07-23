import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import {
  ConsentRepository,
  type ConsentItemRecord,
  type UserConsentCommand,
} from '../infrastructure/consent.repository';

export type ConsentCommand = UserConsentCommand;

@Injectable()
export class ConsentService {
  constructor(@Inject(ConsentRepository) private readonly repository: ConsentRepository) {}

  async listActive(): Promise<ConsentItemRecord[]> {
    return this.repository.listActiveItems();
  }

  async validate(commands: readonly ConsentCommand[]): Promise<void> {
    const ids = commands.map((command) => command.consentItemId);
    if (new Set(ids).size !== ids.length) {
      throw new AppException(AppErrorCode.DUPLICATE_CONSENT_ITEM);
    }
    const [selected, active] = await Promise.all([
      this.repository.findItemsByIds(ids),
      this.repository.listActiveItems(),
    ]);
    if (selected.length !== ids.length) {
      throw new AppException(AppErrorCode.CONSENT_ITEM_NOT_FOUND);
    }
    if (selected.some((item) => !item.active)) {
      throw new AppException(AppErrorCode.CONSENT_ITEM_INACTIVE);
    }
    const agreed = new Map(commands.map((command) => [command.consentItemId, command.agreed]));
    if (active.some((item) => item.required && agreed.get(item.id) !== true)) {
      throw new AppException(AppErrorCode.INVALID_PARAMETER);
    }
  }

  async update(userId: number, commands: readonly ConsentCommand[]): Promise<void> {
    await this.validate(commands);
    await this.repository.upsertUserConsents(userId, commands, new Date());
  }

  async getMarketing(userId: number) {
    return this.repository.getMarketingConsents(userId);
  }

  async updateMarketing(
    userId: number,
    values: Readonly<{ marketingAgreed?: boolean; advertisementAgreed?: boolean }>,
  ) {
    if (values.marketingAgreed === undefined && values.advertisementAgreed === undefined) {
      throw new AppException(AppErrorCode.INVALID_PARAMETER);
    }
    return this.repository.updateMarketingConsents(userId, values, new Date());
  }
}

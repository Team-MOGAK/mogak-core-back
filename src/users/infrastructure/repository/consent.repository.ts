import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import type { ConsentRepositoryPort } from '../../application/port/consent.repository.port';
import type {
  ConsentAgreementCommand,
  UpdateMarketingConsentCommand,
} from '../../application/type/consent.command';
import type { MarketingConsentResult } from '../../application/type/consent.result';
import type { ConsentItem } from '../../domain/entity/consent.entity';
import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { consentItems, userConsents } from '../../../database/schema';

@Injectable()
export class DrizzleConsentRepository implements ConsentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listActiveItems(): Promise<ConsentItem[]> {
    return this.db
      .select({
        id: consentItems.id,
        code: consentItems.code,
        name: consentItems.name,
        description: consentItems.description,
        required: consentItems.required,
        active: consentItems.active,
        createdAt: consentItems.createdAt,
        updatedAt: consentItems.updatedAt,
      })
      .from(consentItems)
      .where(eq(consentItems.active, true));
  }

  async findItemsByIds(ids: readonly number[]): Promise<ConsentItem[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: consentItems.id,
        code: consentItems.code,
        name: consentItems.name,
        description: consentItems.description,
        required: consentItems.required,
        active: consentItems.active,
        createdAt: consentItems.createdAt,
        updatedAt: consentItems.updatedAt,
      })
      .from(consentItems)
      .where(inArray(consentItems.id, [...ids]));
  }

  async upsertUserConsents(
    userId: number,
    commands: readonly ConsentAgreementCommand[],
    now: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const command of commands) {
        await tx
          .insert(userConsents)
          .values({
            userId,
            consentItemId: command.consentItemId,
            agreed: command.agreed,
            agreedAt: command.agreed ? now : null,
            withdrawnAt: command.agreed ? null : now,
          })
          .onConflictDoUpdate({
            target: [userConsents.userId, userConsents.consentItemId],
            set: {
              agreed: command.agreed,
              agreedAt: command.agreed ? now : null,
              withdrawnAt: command.agreed ? null : now,
              updatedAt: now,
            },
          });
      }
    });
  }

  async getMarketingConsents(userId: number): Promise<MarketingConsentResult> {
    const rows = await this.db
      .select({ code: consentItems.code, agreed: userConsents.agreed })
      .from(consentItems)
      .leftJoin(
        userConsents,
        and(eq(userConsents.consentItemId, consentItems.id), eq(userConsents.userId, userId)),
      )
      .where(inArray(consentItems.code, ['MARKETING', 'ADVERTISEMENT']));
    return {
      marketingAgreed: rows.find((row) => row.code === 'MARKETING')?.agreed ?? false,
      advertisementAgreed: rows.find((row) => row.code === 'ADVERTISEMENT')?.agreed ?? false,
    };
  }

  async updateMarketingConsents(
    userId: number,
    command: UpdateMarketingConsentCommand,
    now: Date,
  ): Promise<MarketingConsentResult> {
    const codes = Object.entries(command)
      .filter(
        (entry): entry is ['marketingAgreed' | 'advertisementAgreed', boolean] =>
          entry[1] !== undefined,
      )
      .map(([key]) => (key === 'marketingAgreed' ? 'MARKETING' : 'ADVERTISEMENT'));
    const items = await this.db
      .select({ id: consentItems.id, code: consentItems.code, active: consentItems.active })
      .from(consentItems)
      .where(inArray(consentItems.code, codes));
    if (items.length !== codes.length || items.some((item) => !item.active)) {
      throw new Error('marketing consent item is not active');
    }
    await this.upsertUserConsents(
      userId,
      items.map((item) => ({
        consentItemId: item.id,
        agreed:
          item.code === 'MARKETING'
            ? command.marketingAgreed === true
            : command.advertisementAgreed === true,
      })),
      now,
    );
    return this.getMarketingConsents(userId);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import { consentItems, userConsents } from '../../database/schema';

export type ConsentItemRecord = Readonly<{
  id: number;
  code: string;
  name?: string;
  description?: string | null;
  required: boolean;
  active: boolean;
}>;

export type UserConsentCommand = Readonly<{ consentItemId: number; agreed: boolean }>;

@Injectable()
export class ConsentRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listActiveItems(): Promise<ConsentItemRecord[]> {
    return this.db
      .select({
        id: consentItems.id,
        code: consentItems.code,
        name: consentItems.name,
        description: consentItems.description,
        required: consentItems.required,
        active: consentItems.active,
      })
      .from(consentItems)
      .where(eq(consentItems.active, true));
  }

  async findItemsByIds(ids: readonly number[]): Promise<ConsentItemRecord[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: consentItems.id,
        code: consentItems.code,
        required: consentItems.required,
        active: consentItems.active,
      })
      .from(consentItems)
      .where(inArray(consentItems.id, [...ids]));
  }

  async upsertUserConsents(
    userId: number,
    commands: readonly UserConsentCommand[],
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

  async getMarketingConsents(
    userId: number,
  ): Promise<Readonly<{ marketingAgreed: boolean; advertisementAgreed: boolean }>> {
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
    values: Readonly<{ marketingAgreed?: boolean; advertisementAgreed?: boolean }>,
    now: Date,
  ): Promise<Readonly<{ marketingAgreed: boolean; advertisementAgreed: boolean }>> {
    const codes = Object.entries(values)
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
            ? values.marketingAgreed === true
            : values.advertisementAgreed === true,
      })),
      now,
    );
    return this.getMarketingConsents(userId);
  }
}

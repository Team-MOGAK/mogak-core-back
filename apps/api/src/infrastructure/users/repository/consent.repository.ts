import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ConsentRepositoryPort } from '@core/users/application/port/consent.repository.port';
import type {
  ConsentAgreementCommand,
  UpdateMarketingConsentCommand,
} from '@core/users/application/type/consent.command';
import type {
  ConsentItemState,
  MarketingConsentResult,
} from '@core/users/application/type/consent.result';
import { UserPersistenceException } from '@core/users/domain/exception/userPersistence.exception';
import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import type { Database } from '../../database/database.provider';
import { DATABASE } from '../../database/database.tokens';
import { consentItems, userConsents, users } from '../../database/schema';

@Injectable()
export class ConsentRepository implements ConsentRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listActiveItems(): Promise<ConsentItemState[]> {
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

  async findItemsByIds(ids: readonly number[]): Promise<ConsentItemState[]> {
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
      const consentItemIds = [...new Set(commands.map((command) => command.consentItemId))];
      const marketingItems =
        consentItemIds.length === 0
          ? []
          : await tx
              .select({ id: consentItems.id })
              .from(consentItems)
              .where(
                and(
                  inArray(consentItems.id, consentItemIds),
                  inArray(consentItems.code, ['MARKETING', 'ADVERTISEMENT']),
                ),
              );

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
      if (marketingItems.length > 0) {
        await tx
          .update(users)
          .set({
            marketingConsentVersion: sql`${users.marketingConsentVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
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
    const user = await this.db.query.users.findFirst({
      columns: { marketingConsentVersion: true },
      where: eq(users.id, userId),
    });
    return {
      marketingAgreed: rows.find((row) => row.code === 'MARKETING')?.agreed ?? false,
      advertisementAgreed: rows.find((row) => row.code === 'ADVERTISEMENT')?.agreed ?? false,
      version: user?.marketingConsentVersion ?? 1,
    };
  }

  async updateMarketingConsents(
    userId: number,
    command: UpdateMarketingConsentCommand,
    expectedVersion: number,
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
      throw new UserPersistenceException('Marketing consent item is not active');
    }
    return this.db.transaction(async (tx) => {
      const [updatedUser] = await tx
        .update(users)
        .set({ marketingConsentVersion: sql`${users.marketingConsentVersion} + 1`, updatedAt: now })
        .where(and(eq(users.id, userId), eq(users.marketingConsentVersion, expectedVersion)))
        .returning({ version: users.marketingConsentVersion });
      if (updatedUser === undefined) throw new DomainException(DomainErrorCode.PRECONDITION_FAILED);
      for (const item of items) {
        const agreed =
          item.code === 'MARKETING'
            ? command.marketingAgreed === true
            : command.advertisementAgreed === true;
        await tx
          .insert(userConsents)
          .values({
            userId,
            consentItemId: item.id,
            agreed,
            agreedAt: agreed ? now : null,
            withdrawnAt: agreed ? null : now,
          })
          .onConflictDoUpdate({
            target: [userConsents.userId, userConsents.consentItemId],
            set: {
              agreed,
              agreedAt: agreed ? now : null,
              withdrawnAt: agreed ? null : now,
              updatedAt: now,
            },
          });
      }
      const all = await tx
        .select({ code: consentItems.code, agreed: userConsents.agreed })
        .from(consentItems)
        .leftJoin(
          userConsents,
          and(eq(userConsents.consentItemId, consentItems.id), eq(userConsents.userId, userId)),
        )
        .where(inArray(consentItems.code, ['MARKETING', 'ADVERTISEMENT']));
      return {
        marketingAgreed: all.find((row) => row.code === 'MARKETING')?.agreed ?? false,
        advertisementAgreed: all.find((row) => row.code === 'ADVERTISEMENT')?.agreed ?? false,
        version: updatedUser.version,
      };
    });
  }
}

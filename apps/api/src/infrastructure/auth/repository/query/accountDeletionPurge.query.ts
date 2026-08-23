import { and, eq, inArray, or, sql } from 'drizzle-orm';

import type { Database } from '@infra/database/database.provider';
import {
  authSessions,
  follows,
  jogakExecutions,
  jogakScheduleWeekdays,
  jogakSchedules,
  jogaks,
  modarats,
  mogaks,
  postComments,
  postImages,
  postLikes,
  posts,
  socialAccounts,
  userConsents,
} from '@infra/database/schema';

type CteTransaction = Pick<Database, '$with' | 'with' | 'select' | 'delete'>;

export async function purgePostDomain(tx: CteTransaction, userId: number): Promise<void> {
  const targetPosts = tx.$with('target_posts').as(withdrawalTargetPostIds(tx, userId));
  const targetPostIds = tx.select({ id: targetPosts.id }).from(targetPosts);
  const deletedImages = tx
    .$with('deleted_images')
    .as(
      tx
        .delete(postImages)
        .where(inArray(postImages.postId, targetPostIds))
        .returning({ id: postImages.id }),
    );
  const deletedComments = tx.$with('deleted_comments').as(
    tx
      .delete(postComments)
      .where(or(inArray(postComments.postId, targetPostIds), eq(postComments.authorId, userId)))
      .returning({ id: postComments.id }),
  );
  const deletedLikes = tx.$with('deleted_likes').as(
    tx
      .delete(postLikes)
      .where(or(inArray(postLikes.postId, targetPostIds), eq(postLikes.userId, userId)))
      .returning({ id: postLikes.id }),
  );

  await tx
    .with(targetPosts, deletedImages, deletedComments, deletedLikes)
    .delete(posts)
    .where(
      and(
        inArray(posts.id, targetPostIds),
        cteCompleted(deletedImages),
        cteCompleted(deletedComments),
        cteCompleted(deletedLikes),
      ),
    );
}

export async function purgeMogakDomain(tx: CteTransaction, userId: number): Promise<void> {
  const ownedModarats = tx
    .$with('owned_modarats')
    .as(tx.select({ id: modarats.id }).from(modarats).where(eq(modarats.userId, userId)));
  const ownedModaratIds = tx.select({ id: ownedModarats.id }).from(ownedModarats);
  const ownedMogaks = tx
    .$with('owned_mogaks')
    .as(
      tx.select({ id: mogaks.id }).from(mogaks).where(inArray(mogaks.modaratId, ownedModaratIds)),
    );
  const ownedMogakIds = tx.select({ id: ownedMogaks.id }).from(ownedMogaks);
  const ownedJogaks = tx
    .$with('owned_jogaks')
    .as(tx.select({ id: jogaks.id }).from(jogaks).where(inArray(jogaks.mogakId, ownedMogakIds)));
  const ownedJogakIds = tx.select({ id: ownedJogaks.id }).from(ownedJogaks);
  const ownedSchedules = tx
    .$with('owned_schedules')
    .as(
      tx
        .select({ id: jogakSchedules.id })
        .from(jogakSchedules)
        .where(inArray(jogakSchedules.jogakId, ownedJogakIds)),
    );
  const ownedScheduleIds = tx.select({ id: ownedSchedules.id }).from(ownedSchedules);
  const deletedWeekdays = tx
    .$with('deleted_weekdays')
    .as(
      tx
        .delete(jogakScheduleWeekdays)
        .where(inArray(jogakScheduleWeekdays.scheduleId, ownedScheduleIds))
        .returning({ id: jogakScheduleWeekdays.id }),
    );
  const deletedSchedules = tx.$with('deleted_schedules').as(
    tx
      .delete(jogakSchedules)
      .where(and(inArray(jogakSchedules.jogakId, ownedJogakIds), cteCompleted(deletedWeekdays)))
      .returning({ id: jogakSchedules.id }),
  );
  const deletedExecutions = tx.$with('deleted_executions').as(
    tx
      .delete(jogakExecutions)
      .where(and(inArray(jogakExecutions.jogakId, ownedJogakIds), cteCompleted(deletedSchedules)))
      .returning({ id: jogakExecutions.id }),
  );
  const deletedJogaks = tx.$with('deleted_jogaks').as(
    tx
      .delete(jogaks)
      .where(and(inArray(jogaks.mogakId, ownedMogakIds), cteCompleted(deletedExecutions)))
      .returning({ id: jogaks.id }),
  );
  const deletedMogaks = tx.$with('deleted_mogaks').as(
    tx
      .delete(mogaks)
      .where(and(inArray(mogaks.modaratId, ownedModaratIds), cteCompleted(deletedJogaks)))
      .returning({ id: mogaks.id }),
  );

  await tx
    .with(
      ownedModarats,
      ownedMogaks,
      ownedJogaks,
      ownedSchedules,
      deletedWeekdays,
      deletedSchedules,
      deletedExecutions,
      deletedJogaks,
      deletedMogaks,
    )
    .delete(modarats)
    .where(and(eq(modarats.userId, userId), cteCompleted(deletedMogaks)));
}

export async function purgeAccountRelations(tx: CteTransaction, userId: number): Promise<void> {
  const deletedFollows = tx.$with('deleted_follows').as(
    tx
      .delete(follows)
      .where(or(eq(follows.followerId, userId), eq(follows.followingId, userId)))
      .returning({ id: follows.id }),
  );
  const deletedSessions = tx
    .$with('deleted_sessions')
    .as(
      tx
        .delete(authSessions)
        .where(eq(authSessions.userId, userId))
        .returning({ id: authSessions.id }),
    );
  const deletedSocialAccounts = tx
    .$with('deleted_social_accounts')
    .as(
      tx
        .delete(socialAccounts)
        .where(eq(socialAccounts.userId, userId))
        .returning({ id: socialAccounts.id }),
    );
  const deletedConsents = tx
    .$with('deleted_consents')
    .as(
      tx
        .delete(userConsents)
        .where(eq(userConsents.userId, userId))
        .returning({ id: userConsents.id }),
    );

  await tx
    .with(deletedFollows, deletedSessions, deletedSocialAccounts, deletedConsents)
    .select({ completed: sql<number>`1` })
    .from(deletedFollows)
    .where(
      and(
        cteCompleted(deletedFollows),
        cteCompleted(deletedSessions),
        cteCompleted(deletedSocialAccounts),
        cteCompleted(deletedConsents),
      ),
    );
}

export function withdrawalTargetPostIds(tx: Pick<Database, 'select'>, userId: number) {
  const ownedExecutionIds = tx
    .select({ id: jogakExecutions.id })
    .from(jogakExecutions)
    .innerJoin(jogaks, eq(jogakExecutions.jogakId, jogaks.id))
    .innerJoin(mogaks, eq(jogaks.mogakId, mogaks.id))
    .innerJoin(modarats, eq(mogaks.modaratId, modarats.id))
    .where(eq(modarats.userId, userId));
  return tx
    .select({ id: posts.id })
    .from(posts)
    .where(or(eq(posts.authorId, userId), inArray(posts.jogakExecutionId, ownedExecutionIds)));
}

function cteCompleted(cte: { getSQL(): ReturnType<typeof sql> }) {
  return sql`(select count(*) from ${cte}) >= 0`;
}

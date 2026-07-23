import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../../../database/database.provider';
import { DATABASE } from '../../../database/database.tokens';
import { jogakExecutions, posts } from '../../../database/schema';

export type CreatePostForOccurrenceInput = Readonly<{
  authorId: number;
  jogakId: number;
  scheduledDate: string;
  jogakTitleSnapshot: string;
  contents: string;
}>;

export type CreatedPostRecord = Readonly<{
  id: number;
  jogakExecutionId: number;
  authorId: number;
  jogakId: number;
  scheduledDate: string;
  contents: string;
  createdAt: Date;
}>;

export type CreatePostForOccurrenceResult =
  | Readonly<{ type: 'CREATED'; post: CreatedPostRecord }>
  | Readonly<{ type: 'DUPLICATE' }>;

@Injectable()
export class PostsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createForOccurrence(
    input: CreatePostForOccurrenceInput,
  ): Promise<CreatePostForOccurrenceResult> {
    return this.db.transaction(async (tx) => {
      const [insertedExecution] = await tx
        .insert(jogakExecutions)
        .values({
          jogakId: input.jogakId,
          scheduledDate: input.scheduledDate,
          status: 'IN_PROGRESS',
          jogakTitleSnapshot: input.jogakTitleSnapshot,
        })
        .onConflictDoNothing({ target: [jogakExecutions.jogakId, jogakExecutions.scheduledDate] })
        .returning({ id: jogakExecutions.id });

      const execution =
        insertedExecution ??
        (
          await tx
            .select({ id: jogakExecutions.id })
            .from(jogakExecutions)
            .where(
              and(
                eq(jogakExecutions.jogakId, input.jogakId),
                eq(jogakExecutions.scheduledDate, input.scheduledDate),
              ),
            )
        )[0];
      if (execution === undefined) {
        throw new Error('execution insert conflict did not expose an execution row');
      }

      const [post] = await tx
        .insert(posts)
        .values({
          jogakExecutionId: execution.id,
          authorId: input.authorId,
          contents: input.contents,
        })
        .onConflictDoNothing({ target: posts.jogakExecutionId })
        .returning({
          id: posts.id,
          jogakExecutionId: posts.jogakExecutionId,
          authorId: posts.authorId,
          contents: posts.contents,
          createdAt: posts.createdAt,
        });
      if (post === undefined) return { type: 'DUPLICATE' };

      return {
        type: 'CREATED',
        post: {
          ...post,
          jogakId: input.jogakId,
          scheduledDate: input.scheduledDate,
        },
      };
    });
  }
}

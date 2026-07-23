import { Inject, Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../../common/http/app-error-code';
import { AppException } from '../../../common/http/app.exception';
import { JogaksService } from '../../mogaks/application/jogaks.service';
import { PostsRepository } from '../infrastructure/posts.repository';

const MAX_POST_CONTENTS_LENGTH = 350;

export type CreatePostInput = Readonly<{
  jogakId: number;
  targetDate: string;
  contents: string;
}>;

@Injectable()
export class PostsService {
  constructor(
    @Inject(PostsRepository) private readonly repository: PostsRepository,
    @Inject(JogaksService) private readonly jogaks: JogaksService,
  ) {}

  async createPost(userId: number, input: CreatePostInput) {
    const contents = validatePostContents(input.contents);
    const occurrence = await this.jogaks.resolveOwnedOccurrence(
      userId,
      input.jogakId,
      input.targetDate,
    );
    const result = await this.repository.createForOccurrence({
      authorId: userId,
      jogakId: occurrence.jogakId,
      scheduledDate: input.targetDate,
      jogakTitleSnapshot: occurrence.title,
      contents,
    });
    if (result.type === 'DUPLICATE') throw new AppException(AppErrorCode.POST_ALREADY_EXISTS);

    return {
      id: result.post.id,
      mogakId: occurrence.mogakId,
      jogakId: result.post.jogakId,
      targetDate: result.post.scheduledDate,
      userId: result.post.authorId,
      contents: result.post.contents,
      imgUrls: [],
      createdAt: result.post.createdAt,
    };
  }
}

function validatePostContents(contents: string): string {
  const trimmed = contents?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new AppException(AppErrorCode.INVALID_PARAMETER);
  }
  if (trimmed.length > MAX_POST_CONTENTS_LENGTH) {
    throw new AppException(AppErrorCode.POST_CONTENTS_TOO_LONG);
  }
  return trimmed;
}

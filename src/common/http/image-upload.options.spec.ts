import { jest } from '@jest/globals';

import { DomainException } from './domain.exception';
import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  MAX_POST_IMAGE_COUNT,
  postImageUploadOptions,
  profileImageUploadOptions,
} from './image-upload.options';

describe('이미지 업로드 정책', () => {
  it('5 MiB와 게시글 다섯 장을 제한하며 허용된 이미지 MIME만 받는다', () => {
    expect(MAX_IMAGE_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_POST_IMAGE_COUNT).toBe(5);
    expect(profileImageUploadOptions.limits).toEqual({ fileSize: MAX_IMAGE_FILE_SIZE_BYTES });
    expect(postImageUploadOptions.limits).toEqual({
      fileSize: MAX_IMAGE_FILE_SIZE_BYTES,
      files: MAX_POST_IMAGE_COUNT,
    });

    const filter = profileImageUploadOptions.fileFilter;
    if (filter === undefined) {
      throw new Error('이미지 파일 필터가 필요합니다.');
    }

    for (const mimetype of ['image/jpeg', 'image/png', 'image/webp']) {
      const callback = jest.fn();
      filter({} as Express.Request, { mimetype } as Express.Multer.File, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    }

    const rejected = jest.fn();
    filter({} as Express.Request, { mimetype: 'text/plain' } as Express.Multer.File, rejected);
    expect(rejected).toHaveBeenCalledWith(expect.any(DomainException), false);
  });
});

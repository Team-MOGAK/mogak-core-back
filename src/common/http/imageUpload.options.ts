import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { AppErrorCode } from './appErrorCode';
import { DomainException } from '../domain.exception';

export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_POST_IMAGE_COUNT = 5;

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const allowImage: NonNullable<MulterOptions['fileFilter']> = (_request, file, callback) => {
  if (!imageMimeTypes.has(file.mimetype)) {
    callback(new DomainException(AppErrorCode.INVALID_PARAMETER), false);
    return;
  }
  callback(null, true);
};

export const profileImageUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_IMAGE_FILE_SIZE_BYTES },
  fileFilter: allowImage,
};

export const postImageUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_IMAGE_FILE_SIZE_BYTES, files: MAX_POST_IMAGE_COUNT },
  fileFilter: allowImage,
};

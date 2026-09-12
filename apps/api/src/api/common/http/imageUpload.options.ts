import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';

export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_POST_IMAGE_COUNT = 5;

type SecureMulterOptions = Omit<MulterOptions, 'limits'> & {
  limits: NonNullable<MulterOptions['limits']> & {
    fieldArrayIndexLimit: number;
  };
};

const MAX_FIELD_ARRAY_INDEX = 0;

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const allowImage: NonNullable<MulterOptions['fileFilter']> = (_request, file, callback) => {
  if (!imageMimeTypes.has(file.mimetype)) {
    callback(new DomainException(DomainErrorCode.INVALID_PARAMETER), false);
    return;
  }
  callback(null, true);
};

export const profileImageUploadOptions: SecureMulterOptions = {
  limits: {
    fileSize: MAX_IMAGE_FILE_SIZE_BYTES,
    fieldArrayIndexLimit: MAX_FIELD_ARRAY_INDEX,
  },
  fileFilter: allowImage,
};

export const postImageUploadOptions: SecureMulterOptions = {
  limits: {
    fileSize: MAX_IMAGE_FILE_SIZE_BYTES,
    files: MAX_POST_IMAGE_COUNT,
    fieldArrayIndexLimit: MAX_FIELD_ARRAY_INDEX,
  },
  fileFilter: allowImage,
};

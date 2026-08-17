import { Injectable } from '@nestjs/common';

import { AppErrorCode } from '../../common/http/appErrorCode';
import { DomainException } from '../../common/domain.exception';
import type { StoragePort } from '../application/storage.port';

@Injectable()
export class DisabledStorageAdapter implements StoragePort {
  async uploadProfile(file: Express.Multer.File): Promise<Readonly<{ storageKey: string }>> {
    void file;
    throw new DomainException(AppErrorCode.STORAGE_DISABLED);
  }

  async uploadPostImages(
    files: readonly Express.Multer.File[],
  ): Promise<ReadonlyArray<Readonly<{ storageKey: string }>>> {
    void files;
    throw new DomainException(AppErrorCode.STORAGE_DISABLED);
  }

  async replaceProfile(
    previousKey: string | null,
    file: Express.Multer.File,
  ): Promise<Readonly<{ storageKey: string }>> {
    void previousKey;
    void file;
    throw new DomainException(AppErrorCode.STORAGE_DISABLED);
  }

  async deleteProfile(storageKey: string): Promise<void> {
    void storageKey;
    throw new DomainException(AppErrorCode.STORAGE_DISABLED);
  }

  async resolvePublicUrl(storageKey: string): Promise<string | null> {
    void storageKey;
    return null;
  }
}

import { DomainErrorCode, DomainException } from '@core/common/error/domainException';
import { Injectable } from '@nestjs/common';

import type { BinaryUpload, StoragePort } from '@core/storage/application/storage.port';

@Injectable()
export class DisabledStorageAdapter implements StoragePort {
  async uploadProfile(file: BinaryUpload): Promise<Readonly<{ storageKey: string }>> {
    void file;
    throw new DomainException(DomainErrorCode.STORAGE_DISABLED);
  }

  async uploadPostImages(
    files: readonly BinaryUpload[],
  ): Promise<ReadonlyArray<Readonly<{ storageKey: string }>>> {
    void files;
    throw new DomainException(DomainErrorCode.STORAGE_DISABLED);
  }

  async replaceProfile(
    previousKey: string | null,
    file: BinaryUpload,
  ): Promise<Readonly<{ storageKey: string }>> {
    void previousKey;
    void file;
    throw new DomainException(DomainErrorCode.STORAGE_DISABLED);
  }

  async deleteProfile(storageKey: string): Promise<void> {
    void storageKey;
    throw new DomainException(DomainErrorCode.STORAGE_DISABLED);
  }

  async resolvePublicUrl(storageKey: string): Promise<string | null> {
    void storageKey;
    return null;
  }
}

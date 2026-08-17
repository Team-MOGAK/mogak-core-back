export const STORAGE_PORT = Symbol('STORAGE_PORT');

export type BinaryUpload = Readonly<{ size: number }>;

export interface StoragePort {
  uploadProfile(file: BinaryUpload): Promise<Readonly<{ storageKey: string }>>;
  uploadPostImages(
    files: readonly BinaryUpload[],
  ): Promise<ReadonlyArray<Readonly<{ storageKey: string }>>>;
  replaceProfile(
    previousKey: string | null,
    file: BinaryUpload,
  ): Promise<Readonly<{ storageKey: string }>>;
  deleteProfile(storageKey: string): Promise<void>;
  resolvePublicUrl(storageKey: string): Promise<string | null>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoragePort {
  uploadProfile(file: Express.Multer.File): Promise<Readonly<{ storageKey: string }>>;
  replaceProfile(
    previousKey: string | null,
    file: Express.Multer.File,
  ): Promise<Readonly<{ storageKey: string }>>;
  deleteProfile(storageKey: string): Promise<void>;
  resolvePublicUrl(storageKey: string): Promise<string | null>;
}

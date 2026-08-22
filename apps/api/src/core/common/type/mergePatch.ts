/** A shallow JSON Merge Patch command. Nested fields are replaced atomically. */
export type MergePatch<T extends object> = Readonly<{
  [Key in keyof T]?: T[Key] | undefined;
}>;

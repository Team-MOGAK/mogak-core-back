/** A row from the `jobs` table. */
export type Job = Readonly<{
  id: number;
  name: string;
}>;

/** A row from the `addresses` table. */
export type Address = Readonly<{
  id: number;
  name: string;
}>;

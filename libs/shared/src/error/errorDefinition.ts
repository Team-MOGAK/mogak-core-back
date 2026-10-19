export type ErrorDefinition = Readonly<{
  httpStatus: number;
  code: string;
  message: string;
}>;

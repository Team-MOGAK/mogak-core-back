import type { SourceEnvironment } from '../application/type/alert.type.js';

export type PresentationConfig = Readonly<{
  gcpProjectId: string;
  sourceApiService: string;
  expectedSubscription: string;
  sourceEnvironment: SourceEnvironment;
}>;

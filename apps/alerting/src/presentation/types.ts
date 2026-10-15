export type PresentationConfig = Readonly<{
  gcpProjectId: string;
  sourceApiService: string;
  expectedSubscription: string;
  sourceEnvironment: 'production';
}>;

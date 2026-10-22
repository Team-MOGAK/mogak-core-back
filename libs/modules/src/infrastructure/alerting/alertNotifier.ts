export const ALERT_NOTIFIER = Symbol('ALERT_NOTIFIER');

export type AlertNotification = Readonly<{
  event: string;
  errorId: string;
  statusCode?: number;
  appCode?: string;
  method?: string;
  route?: string | undefined;
}>;

export interface AlertNotifier {
  notify(alert: AlertNotification): void;
}

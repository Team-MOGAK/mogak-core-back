import type { Alert, AlertSummary } from '../type/alert.type.js';

export type DeliveryOptions = Readonly<{
  deadline?: number;
  signal?: AbortSignal;
}>;

export type DeliveryOutcome = Readonly<{
  acknowledged: boolean;
  reason: string;
}>;

export const SENDER_RESULT_KIND = {
  SUCCESS: 'success',
  RATE_LIMITED: 'rate_limited',
  TRANSIENT_FAILURE: 'transient_failure',
  PERMANENT_FAILURE: 'permanent_failure',
} as const;

export const PERMANENT_FAILURE_REASON = {
  WEBHOOK_REJECTED: 'discord_webhook_rejected',
  PAYLOAD_REJECTED: 'discord_payload_rejected',
} as const;

export type SenderResult =
  | Readonly<{ kind: typeof SENDER_RESULT_KIND.SUCCESS; status: number; messageId: string }>
  | Readonly<{ kind: typeof SENDER_RESULT_KIND.RATE_LIMITED; status: 429 }>
  | Readonly<{
      kind: typeof SENDER_RESULT_KIND.TRANSIENT_FAILURE;
      status?: number;
      reason: 'timeout' | 'network' | 'server' | 'invalid_response';
    }>
  | Readonly<{
      kind: typeof SENDER_RESULT_KIND.PERMANENT_FAILURE;
      status: number;
      reason: (typeof PERMANENT_FAILURE_REASON)[keyof typeof PERMANENT_FAILURE_REASON];
    }>;

export interface AlertSender {
  send(summary: AlertSummary, options?: DeliveryOptions): Promise<SenderResult>;
}

export const QUARANTINE_REASONS = [
  'body_too_large',
  'malformed_envelope',
  'invalid_log_entry',
  'discord_payload_rejected',
  'discord_webhook_rejected',
] as const;

export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export type QuarantineRecord = Readonly<{
  reason: QuarantineReason;
  receivedAt: string;
  errorId?: string;
  statusCode?: number;
  appCode?: string;
}>;

export interface QuarantinePort {
  publish(record: QuarantineRecord, options?: DeliveryOptions): Promise<void>;
}

export type AlertLogger = Readonly<{
  info?(object: Record<string, unknown>, message?: string): void;
  warn?(object: Record<string, unknown>, message?: string): void;
  error?(object: Record<string, unknown>, message?: string): void;
}>;

export type DeliveryUseCase = Readonly<{
  deliver(alert: Alert, options?: DeliveryOptions): Promise<DeliveryOutcome>;
}>;

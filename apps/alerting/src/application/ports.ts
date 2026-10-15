import type { Alert, AlertSummary } from './contracts.js';

export type DeliveryOutcome = Readonly<{
  acknowledged: boolean;
  reason: string;
}>;

export type SenderResult =
  | Readonly<{ kind: 'success'; status: number; messageId: string }>
  | Readonly<{ kind: 'rate_limited'; status: 429; retryAfterMs: number }>
  | Readonly<{
      kind: 'transient_failure';
      status?: number;
      reason: 'timeout' | 'network' | 'server' | 'invalid_response';
    }>
  | Readonly<{
      kind: 'permanent_failure';
      status: number;
      disableChannel: boolean;
    }>;

export interface AlertSender {
  send(summary: AlertSummary, options?: { deadline?: number }): Promise<SenderResult>;
}

export type ChannelLease = Readonly<{
  token: string;
  leaseExpiresAt: number;
  secretVersion: number;
}>;

export type ClaimResult =
  | Readonly<{ kind: 'claimed'; lease: ChannelLease }>
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'cooldown'; nextAllowedAt: number }>
  | Readonly<{ kind: 'busy'; leaseExpiresAt: number }>;

export type FencedWriteResult = 'fenced' | 'stale';

export interface ChannelStatePort {
  claim(now: number): Promise<ClaimResult>;
  release(lease: ChannelLease): Promise<FencedWriteResult>;
  recordRateLimit(
    lease: ChannelLease,
    nextAllowedAt: number,
    now?: number,
  ): Promise<FencedWriteResult>;
  disable(lease: ChannelLease): Promise<FencedWriteResult>;
}

export const QUARANTINE_REASONS = [
  'body_too_large',
  'malformed_envelope',
  'invalid_log_entry',
  'discord_payload_rejected',
  'discord_channel_disabled',
] as const;

export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export type QuarantineRecord = Readonly<{
  reason: QuarantineReason;
  receivedAt: string;
  errorId?: string;
  statusCode?: number;
  appCode?: 'Z006' | 'Z500';
}>;

export interface QuarantinePort {
  publish(record: QuarantineRecord): Promise<void>;
}

export type AlertLogger = Readonly<{
  info?(object: Record<string, unknown>, message?: string): void;
  warn?(object: Record<string, unknown>, message?: string): void;
  error?(object: Record<string, unknown>, message?: string): void;
}>;

export type DeliveryDependencies = Readonly<{
  sender: AlertSender;
  state: ChannelStatePort;
  quarantine: QuarantinePort;
  clock?: () => number;
  logger?: AlertLogger;
}>;

export type DeliveryUseCase = Readonly<{
  deliver(alert: Alert, options?: { deadline?: number }): Promise<DeliveryOutcome>;
}>;

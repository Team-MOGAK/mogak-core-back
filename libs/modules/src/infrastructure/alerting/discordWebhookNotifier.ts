import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppErrorCode, LogEvent, LogEventSummary } from '@mogak/shared';

import type { AlertNotification, AlertNotifier } from './alertNotifier';

const TIMEOUT_MS = 2_000;
const MAX_CONTENT_LENGTH = 1_800;
const EVENTS = new Set<string>(Object.values(LogEvent));
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const APP_CODES = new Map<string, string>(
  Object.values(AppErrorCode).map(({ code, message }) => [code, message]),
);
const RECOVERY_EVENTS = new Set<string>([LogEvent.READINESS_RECOVERED]);
/** 같은 종류(event+status+method+route) 알림은 이 시간 동안 한 번만 보낸다. */
export const ALERT_DEDUP_WINDOW_MS = 5 * 60_000;
const MAX_DEDUP_KEYS = 500;

type DedupEntry = { windowStartedAt: number; suppressed: number };

@Injectable()
export class DiscordWebhookNotifier implements AlertNotifier, OnModuleInit {
  private readonly logger = new Logger(DiscordWebhookNotifier.name);
  private readonly webhookUrl: string | undefined;
  private readonly unavailableReason: 'missing' | 'invalid' | undefined;
  private readonly dedup = new Map<string, DedupEntry>();

  constructor(
    webhookUrl: string | undefined = process.env.DISCORD_WEBHOOK_URL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly now: () => number = Date.now,
  ) {
    const candidate = webhookUrl?.trim();
    if (candidate === undefined || candidate.length === 0) {
      this.webhookUrl = undefined;
      this.unavailableReason = 'missing';
      return;
    }
    if (!isValidWebhookUrl(candidate)) {
      this.webhookUrl = undefined;
      this.unavailableReason = 'invalid';
      return;
    }
    this.webhookUrl = candidate;
    this.unavailableReason = undefined;
  }

  onModuleInit(): void {
    if (this.unavailableReason === 'missing') {
      this.logger.warn('Discord alerting is disabled: DISCORD_WEBHOOK_URL is not configured.');
    } else if (this.unavailableReason === 'invalid') {
      this.logger.warn('Discord alerting is disabled: DISCORD_WEBHOOK_URL is invalid.');
    }
  }

  notify(alert: AlertNotification): void {
    try {
      if (this.webhookUrl === undefined) return;
      if (!isAlertable(alert)) return;
      const suppressed = this.admit(alert);
      if (suppressed === undefined) return;
      const payload = buildPayload(alert, this.env, suppressed);
      if (payload === undefined) return;
      void this.send(payload, alert.errorId, this.webhookUrl).catch(() => {
        this.logger.warn('Discord alert delivery failed (internal error).');
      });
    } catch {
      this.logger.warn('Discord alert preparation failed.');
    }
  }

  /**
   * 반복 알림을 window 단위로 묶는다. 보낼 차례면 직전 window에서 억제한 건수를,
   * 억제해야 하면 undefined를 반환한다. 인스턴스 메모리 기준이다.
   */
  private admit(alert: AlertNotification): number | undefined {
    const now = this.now();
    const key = dedupKey(alert);
    const entry = this.dedup.get(key);
    if (entry !== undefined && now - entry.windowStartedAt < ALERT_DEDUP_WINDOW_MS) {
      entry.suppressed += 1;
      return undefined;
    }
    const previouslySuppressed = entry?.suppressed ?? 0;
    this.dedup.delete(key);
    if (this.dedup.size >= MAX_DEDUP_KEYS) this.prune(now);
    this.dedup.set(key, { windowStartedAt: now, suppressed: 0 });
    return previouslySuppressed;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.dedup) {
      if (now - entry.windowStartedAt >= ALERT_DEDUP_WINDOW_MS) this.dedup.delete(key);
    }
    // 모두 유효한 window라면 가장 오래된 키부터 버린다(Map은 삽입 순서 유지).
    while (this.dedup.size >= MAX_DEDUP_KEYS) {
      const oldest = this.dedup.keys().next().value;
      if (oldest === undefined) break;
      this.dedup.delete(oldest);
    }
  }

  private async send(payload: DiscordPayload, errorId: string, webhookUrl: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = new URL(webhookUrl);
      url.searchParams.set('wait', 'true');
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: controller.signal,
      });
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) {
        this.logger.warn(
          `Discord alert delivery failed (status=${response.status}, errorId=${errorId}).`,
        );
      }
    } catch {
      this.logger.warn(`Discord alert delivery failed (network or timeout, errorId=${errorId}).`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

type DiscordPayload = Readonly<{
  content: string;
  allowed_mentions: Readonly<{ parse: readonly [] }>;
}>;

function isAlertable(alert: AlertNotification): boolean {
  if (RECOVERY_EVENTS.has(alert.event)) return true;
  return (
    Number.isInteger(alert.statusCode) &&
    (alert.statusCode ?? 0) >= 500 &&
    (alert.statusCode ?? 0) <= 599
  );
}

function safeEvent(value: string): string {
  return EVENTS.has(value) ? value : LogEvent.UNKNOWN_ERROR;
}

function dedupKey(alert: AlertNotification): string {
  return [
    safeEvent(alert.event),
    alert.statusCode ?? '',
    safeMethod(alert.method) ?? '',
    safeRouteTemplate(alert.route) ?? '',
  ].join('|');
}

function buildPayload(
  alert: AlertNotification,
  env: NodeJS.ProcessEnv,
  suppressed = 0,
): DiscordPayload | undefined {
  if (!isAlertable(alert)) return undefined;
  const event = safeEvent(alert.event);
  const recovery = RECOVERY_EVENTS.has(event);
  const appCode =
    alert.appCode !== undefined && APP_CODES.has(alert.appCode) ? alert.appCode : undefined;
  const method = safeMethod(alert.method);
  const route = safeRouteTemplate(alert.route);
  const now = new Date().toISOString();
  const service = env.K_SERVICE || 'mogak-core-api';
  const environment = env.NODE_ENV === 'production' ? 'production' : 'development';
  const projectId = env.GOOGLE_CLOUD_PROJECT ?? env.GCP_PROJECT_ID;
  const logs = projectId ? loggingLink(projectId, alert.errorId) : undefined;
  const lines = [
    `${recovery ? '✅' : '🚨'} ${LogEventSummary[event as keyof typeof LogEventSummary] ?? 'Server error'}`,
    `Environment: ${environment}`,
    `Service: ${service}`,
    `Error ID: ${alert.errorId}`,
    `Time: ${now}`,
    ...(alert.statusCode === undefined ? [] : [`Status: ${alert.statusCode}`]),
    ...(appCode === undefined ? [] : [`App code: ${appCode} (${APP_CODES.get(appCode)})`]),
    ...(method === undefined ? [] : [`Method: ${method}`]),
    ...(route === undefined ? [] : [`Route: ${route}`]),
    ...(logs === undefined ? [] : [`Logs: ${logs}`]),
    ...(suppressed > 0
      ? [
          `Suppressed: ${suppressed} similar alert(s) in the previous ${ALERT_DEDUP_WINDOW_MS / 60_000}m window`,
        ]
      : []),
  ];
  const content = lines.join('\n');
  return {
    content:
      content.length <= MAX_CONTENT_LENGTH
        ? content
        : `${content.slice(0, MAX_CONTENT_LENGTH - 1)}…`,
    allowed_mentions: { parse: [] },
  };
}

function isValidWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'discord.com' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.search === '' &&
      url.hash === '' &&
      !url.pathname.endsWith('/') &&
      segments.length === 4 &&
      segments[0] === 'api' &&
      segments[1] === 'webhooks' &&
      /^\d{1,30}$/.test(segments[2] ?? '') &&
      /^[A-Za-z0-9_.-]{1,256}$/.test(segments[3] ?? '')
    );
  } catch {
    return false;
  }
}

function safeMethod(value: unknown): string | undefined {
  return typeof value === 'string' && METHODS.has(value) ? value : undefined;
}

function safeRouteTemplate(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    !value.startsWith('/') ||
    value.includes('?') ||
    value.includes('#')
  )
    return undefined;
  const segments = value.slice(1).split('/');
  return segments.every((segment) =>
    segment.startsWith(':')
      ? /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment)
      : /^[A-Za-z0-9._~-]+$/.test(segment),
  )
    ? value
    : undefined;
}

function loggingLink(projectId: string, errorId: string): string {
  return `https://console.cloud.google.com/logs/query?project=${encodeURIComponent(projectId)}&query=${encodeURIComponent(`jsonPayload.errorId="${errorId}"`)}`;
}

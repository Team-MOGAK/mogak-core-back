import { Global, Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { AppErrorCode, LogEvent, LogEventSummary } from '@mogak/shared';

export const ALERT_NOTIFIER = Symbol('ALERT_NOTIFIER');

export type AlertNotification = Readonly<{
  event: string;
  errorId: string;
  statusCode?: number;
  appCode?: string;
  method?: string;
  routeTemplate?: string;
}>;

export interface AlertNotifier {
  notify(alert: AlertNotification): void;
}

const TIMEOUT_MS = 2_000;
const MAX_CONTENT_LENGTH = 1_800;
const EVENTS = new Set<string>(Object.values(LogEvent));
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const APP_CODES = new Map<string, string>(
  Object.values(AppErrorCode).map(({ code, message }) => [code, message]),
);

@Injectable()
export class DiscordWebhookNotifier implements AlertNotifier, OnModuleInit {
  private readonly logger = new Logger(DiscordWebhookNotifier.name);
  private readonly webhookUrl: string | undefined;
  private readonly unavailableReason: 'missing' | 'invalid' | undefined;

  constructor(
    webhookUrl: string | undefined = process.env.DISCORD_WEBHOOK_URL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly env: NodeJS.ProcessEnv = process.env,
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
      this.warn('Discord alerting is disabled: DISCORD_WEBHOOK_URL is not configured.');
    } else if (this.unavailableReason === 'invalid') {
      this.warn('Discord alerting is disabled: DISCORD_WEBHOOK_URL is invalid.');
    }
  }

  notify(alert: AlertNotification): void {
    try {
      if (this.webhookUrl === undefined) return;
      const payload = buildPayload(alert, this.env);
      if (payload === undefined) return;
      void this.send(payload, alert.errorId, this.webhookUrl).catch(() => {
        this.warn('Discord alert delivery failed (internal error).');
      });
    } catch {
      this.warn('Discord alert preparation failed.');
    }
  }

  private warn(message: string): void {
    try {
      this.logger.warn(message);
    } catch {
      // Notification logging must never change the API response.
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
        this.warn(`Discord alert delivery failed (status=${response.status}, errorId=${errorId}).`);
      }
    } catch {
      this.warn(`Discord alert delivery failed (network or timeout, errorId=${errorId}).`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

type DiscordPayload = Readonly<{
  content: string;
  allowed_mentions: Readonly<{ parse: readonly [] }>;
}>;

function buildPayload(
  alert: AlertNotification,
  env: NodeJS.ProcessEnv,
): DiscordPayload | undefined {
  if (
    !isUuid(alert.errorId) ||
    !Number.isInteger(alert.statusCode) ||
    (alert.statusCode ?? 0) < 500 ||
    (alert.statusCode ?? 0) > 599
  ) {
    return undefined;
  }
  const event = EVENTS.has(alert.event) ? alert.event : LogEvent.UNKNOWN_ERROR;
  const appCode =
    alert.appCode !== undefined && APP_CODES.has(alert.appCode) ? alert.appCode : undefined;
  const method = safeMethod(alert.method);
  const route = safeRouteTemplate(alert.routeTemplate);
  const now = new Date().toISOString();
  const service = safeLabel(env.K_SERVICE) ?? 'mogak-core-api';
  const environment = env.NODE_ENV === 'production' ? 'production' : 'development';
  const projectId = safeProjectId(env.GOOGLE_CLOUD_PROJECT ?? env.GCP_PROJECT_ID);
  const logs = projectId === undefined ? undefined : loggingLink(projectId, alert.errorId);
  const lines = [
    `🚨 ${LogEventSummary[event as keyof typeof LogEventSummary] ?? 'Server error'}`,
    `Environment: ${environment}`,
    `Service: ${service}`,
    `Error ID: ${alert.errorId}`,
    `Time: ${now}`,
    `Status: ${alert.statusCode}`,
    ...(appCode === undefined ? [] : [`App code: ${appCode} (${APP_CODES.get(appCode)})`]),
    ...(method === undefined ? [] : [`Method: ${method}`]),
    ...(route === undefined ? [] : [`Route: ${route}`]),
    ...(logs === undefined ? [] : [`Logs: ${logs}`]),
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

function safeLabel(value: string | undefined): string | undefined {
  return value !== undefined && /^[A-Za-z0-9._-]{1,63}$/.test(value) ? value : undefined;
}

function safeProjectId(value: string | undefined): string | undefined {
  return value !== undefined && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value) ? value : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function loggingLink(projectId: string, errorId: string): string {
  return `https://console.cloud.google.com/logs/query?project=${encodeURIComponent(projectId)}&query=${encodeURIComponent(`jsonPayload.errorId="${errorId}"`)}`;
}

@Global()
@Module({
  providers: [
    { provide: DiscordWebhookNotifier, useFactory: () => new DiscordWebhookNotifier() },
    { provide: ALERT_NOTIFIER, useExisting: DiscordWebhookNotifier },
  ],
  exports: [ALERT_NOTIFIER, DiscordWebhookNotifier],
})
export class AlertingModule {}

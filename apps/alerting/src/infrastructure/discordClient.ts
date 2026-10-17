import {
  DISCORD_TIMEOUT_MS,
  MAX_RATE_LIMIT_MS,
  RATE_LIMIT_FALLBACK_MS,
  validateDiscordWebhookUrl,
} from './discord.policy.js';
import type { AlertSummary } from '../application/type/alert.type.js';
import {
  PERMANENT_FAILURE_REASON,
  SENDER_RESULT_KIND,
  type SenderResult,
} from '../application/port/alertDelivery.port.js';
import { buildDiscordPayload, type DiscordPayload } from './discord.js';

const MAX_SUCCESS_RESPONSE_BODY_BYTES = 64 * 1024;

export type FetchLike = typeof fetch;

export class DiscordClient {
  private readonly webhookUrl: string;
  private nextAllowedAt = 0;

  constructor(
    webhookUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DISCORD_TIMEOUT_MS,
    private readonly clock: () => number = Date.now,
  ) {
    this.webhookUrl = validateDiscordWebhookUrl(webhookUrl);
  }

  async send(
    summary: AlertSummary,
    options?: { deadline?: number; signal?: AbortSignal },
  ): Promise<SenderResult>;
  async send(
    payload: DiscordPayload,
    options?: { deadline?: number; signal?: AbortSignal },
  ): Promise<SenderResult>;
  async send(
    value: AlertSummary | DiscordPayload,
    options: { deadline?: number; signal?: AbortSignal } = {},
  ): Promise<SenderResult> {
    const payload = 'source' in value ? buildDiscordPayload(value) : value;
    const now = this.clock();
    if (this.nextAllowedAt > now) {
      return {
        kind: SENDER_RESULT_KIND.RATE_LIMITED,
        status: 429,
        retryAfterMs: this.nextAllowedAt - now,
      };
    }
    const deadline = options.deadline ?? now + this.timeoutMs;
    const remaining = deadline - this.clock();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'timeout' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(this.timeoutMs, Math.max(1, remaining)),
    );
    const abortParent = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abortParent, { once: true });

    try {
      const url = new URL(this.webhookUrl);
      url.searchParams.set('wait', 'true');
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        return {
          kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE,
          reason: isAbortError(error) ? 'timeout' : 'network',
        };
      }

      if (response.status >= 200 && response.status < 300) {
        try {
          const messageId = await readSuccessMessageId(response);
          if (controller.signal.aborted) {
            return { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'timeout' };
          }
          return messageId === undefined
            ? {
                kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE,
                status: response.status,
                reason: 'invalid_response',
              }
            : { kind: SENDER_RESULT_KIND.SUCCESS, status: response.status, messageId };
        } catch (error) {
          return controller.signal.aborted || isAbortError(error)
            ? { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'timeout' }
            : {
                kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE,
                status: response.status,
                reason: 'invalid_response',
              };
        }
      }
      if (response.status === 429) {
        const retryAfterMs = await retryAfterMsFromResponse(response);
        this.nextAllowedAt = Math.max(this.nextAllowedAt, this.clock() + retryAfterMs);
        return {
          kind: SENDER_RESULT_KIND.RATE_LIMITED,
          status: 429,
          retryAfterMs,
        };
      }
      if (response.status >= 500) {
        await discardResponseBody(response);
        return {
          kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE,
          status: response.status,
          reason: 'server',
        };
      }
      await discardResponseBody(response);
      return {
        kind: SENDER_RESULT_KIND.PERMANENT_FAILURE,
        status: response.status,
        reason:
          response.status === 401 || response.status === 403 || response.status === 404
            ? PERMANENT_FAILURE_REASON.WEBHOOK_REJECTED
            : PERMANENT_FAILURE_REASON.PAYLOAD_REJECTED,
      };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortParent);
    }
  }
}

async function readSuccessMessageId(response: Response): Promise<string | undefined> {
  if (response.body === null) return undefined;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let completed = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        completed = true;
        break;
      }
      size += chunk.value.byteLength;
      if (size > MAX_SUCCESS_RESPONSE_BODY_BYTES) return undefined;
      chunks.push(chunk.value);
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // The response body is diagnostic-free and cancellation is best effort.
      }
    }
    reader.releaseLock();
  }

  let json: string;
  try {
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    json = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const messageId = parsed.id;
  return typeof messageId === 'string' && /^[0-9]{1,30}$/.test(messageId) ? messageId : undefined;
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A response body is diagnostic-free and is never allowed to affect the outcome.
  }
}

export async function retryAfterMs(response: Pick<Response, 'headers' | 'json'>): Promise<number> {
  return retryAfterMsFromResponse(response);
}

async function retryAfterMsFromResponse(
  response: Pick<Response, 'headers' | 'json'>,
): Promise<number> {
  const values: number[] = [];
  const header = response.headers.get('retry-after');
  const headerMs = secondsToMs(header);
  if (headerMs !== undefined) values.push(headerMs);

  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      const bodyMs = secondsToMs(body.retry_after);
      if (bodyMs !== undefined) values.push(bodyMs);
    }
  } catch {
    // The fallback below is deliberately conservative when Discord's body is unavailable.
  }

  const retry = values.length === 0 ? RATE_LIMIT_FALLBACK_MS : Math.max(...values);
  return Math.min(MAX_RATE_LIMIT_MS, retry);
}

function secondsToMs(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(MAX_RATE_LIMIT_MS, Math.ceil(parsed * 1_000));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (isRecord(error) && error.name === 'AbortError')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

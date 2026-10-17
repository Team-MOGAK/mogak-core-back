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
  type DeliveryOptions,
  type SenderResult,
} from '../application/port/alertDelivery.port.js';
import { buildDiscordPayload } from './discord.js';

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

  async send(summary: AlertSummary, options: DeliveryOptions = {}): Promise<SenderResult> {
    const payload = buildDiscordPayload(summary);
    const now = this.clock();
    if (this.nextAllowedAt > now) {
      return {
        kind: SENDER_RESULT_KIND.RATE_LIMITED,
        status: 429,
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

      if (controller.signal.aborted) {
        await discardResponseBody(response);
        return { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'timeout' };
      }

      if (response.status >= 200 && response.status < 300) {
        try {
          const messageId = await readSuccessMessageId(response, controller.signal);
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
        let retryAfterMs: number;
        try {
          retryAfterMs = await retryAfterMsFromResponse(response, controller.signal);
        } catch (error) {
          return controller.signal.aborted || isAbortError(error)
            ? { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'timeout' }
            : { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'invalid_response' };
        }
        if (controller.signal.aborted) {
          return { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'timeout' };
        }
        this.nextAllowedAt = Math.max(this.nextAllowedAt, this.clock() + retryAfterMs);
        return {
          kind: SENDER_RESULT_KIND.RATE_LIMITED,
          status: 429,
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

async function readSuccessMessageId(
  response: Response,
  signal: AbortSignal,
): Promise<string | undefined> {
  let body: Buffer | undefined;
  try {
    body = await readBoundedResponseBody(response, MAX_SUCCESS_RESPONSE_BODY_BYTES, signal);
  } catch (error) {
    if (signal.aborted || isAbortError(error)) throw error;
    body = undefined;
  }
  if (body === undefined) return undefined;

  let json: string;
  try {
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

async function retryAfterMsFromResponse(response: Response, signal: AbortSignal): Promise<number> {
  const values: number[] = [];
  const header = response.headers.get('retry-after');
  const headerMs = secondsToMs(header);
  if (headerMs !== undefined) values.push(headerMs);

  let body: Buffer | undefined;
  try {
    body = await readBoundedResponseBody(response, MAX_SUCCESS_RESPONSE_BODY_BYTES, signal);
  } catch (error) {
    if (signal.aborted || isAbortError(error)) throw error;
    body = undefined;
  }
  if (body !== undefined) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body);
      const parsed: unknown = JSON.parse(decoded);
      if (isRecord(parsed)) {
        const bodyMs = secondsToMs(parsed.retry_after);
        if (bodyMs !== undefined) values.push(bodyMs);
      }
    } catch {
      // The fallback below is deliberately conservative when Discord's body is unavailable.
    }
  }

  const retry = values.length === 0 ? RATE_LIMIT_FALLBACK_MS : Math.max(...values);
  return Math.min(MAX_RATE_LIMIT_MS, retry);
}

async function readBoundedResponseBody(
  response: Response,
  limit: number,
  signal?: AbortSignal,
): Promise<Buffer | undefined> {
  if (response.body === null) return undefined;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let completed = false;
  let abortReject: ((reason?: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortReject = reject;
  });
  const abortReading = () => {
    void reader.cancel().catch(() => undefined);
    abortReject?.(new DOMException('aborted', 'AbortError'));
  };
  if (signal?.aborted) {
    abortReading();
  } else {
    signal?.addEventListener('abort', abortReading, { once: true });
  }

  try {
    for (;;) {
      const chunk =
        signal === undefined
          ? await reader.read()
          : await Promise.race([reader.read(), abortPromise]);
      if (chunk.done) {
        completed = true;
        break;
      }
      size += chunk.value.byteLength;
      if (size > limit) return undefined;
      chunks.push(chunk.value);
    }
  } finally {
    if (!completed) {
      void reader.cancel().catch(() => undefined);
    } else {
      reader.releaseLock();
    }
    signal?.removeEventListener('abort', abortReading);
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
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

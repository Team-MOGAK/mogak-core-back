import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { DiscordWebhookNotifier } from '@infra/alerting/alerting.module';

const ERROR_ID = '11111111-1111-4111-8111-111111111111';
const WEBHOOK = 'https://discord.com/api/webhooks/123456789012345678/secret-token';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('DiscordWebhookNotifier', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('비동기 HTTP 발송을 시작하고 allowlist 데이터만 웹훅에 전달한다', async () => {
    let requestBody = '';
    let resolveRequest: (() => void) | undefined;
    const received = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        requestBody = Buffer.concat(chunks).toString('utf8');
        response.writeHead(204);
        response.end();
        resolveRequest?.();
      });
    });
    const localUrl = await listen(server);
    let fetchCompletion: Promise<Response> | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      fetchCompletion = fetch(`${localUrl}/webhook`, init);
      return fetchCompletion;
    };
    const notifier = new DiscordWebhookNotifier(WEBHOOK, fetchImpl, {
      NODE_ENV: 'production',
      K_SERVICE: 'mogak-core-api',
      GOOGLE_CLOUD_PROJECT: 'mogak-production',
    });

    try {
      const result = notifier.notify({
        event: 'unhandled_exception',
        errorId: ERROR_ID,
        statusCode: 500,
        appCode: 'Z001',
        method: 'GET',
        routeTemplate: '/users/:id',
      });
      expect(result).toBeUndefined();
      await received;
      await fetchCompletion;

      const request = JSON.parse(requestBody) as {
        content: string;
        allowed_mentions: { parse: string[] };
      };
      expect(request.allowed_mentions).toEqual({ parse: [] });
      expect(request.content).toContain('Error ID: ' + ERROR_ID);
      expect(request.content).toContain('Route: /users/:id');
      expect(request.content).toContain('Status: 500');
      expect(request.content).not.toContain('secret-token');
      expect(request.content).not.toContain('https://discord.com');
      expect(request.content).not.toContain('untrusted exception text');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('secret이 없으면 발송 없이 alerting 비활성화 경고를 남기며 알림만 꺼 둔다', () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchImpl = jest.fn<typeof fetch>();
    const notifier = new DiscordWebhookNotifier(undefined, fetchImpl);

    notifier.onModuleInit();
    expect(() =>
      notifier.notify({ event: 'unhandled_exception', errorId: ERROR_ID, statusCode: 500 }),
    ).not.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('DISCORD_WEBHOOK_URL is not configured.'),
    );
  });

  it('Discord 실패가 API 호출자에게 전파되지 않고 원본 오류·secret을 로그에 남기지 않는다', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`${WEBHOOK} private SQL parameter`));
    const notifier = new DiscordWebhookNotifier(WEBHOOK, fetchImpl);

    expect(() =>
      notifier.notify({ event: 'unhandled_exception', errorId: ERROR_ID, statusCode: 500 }),
    ).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(warning).toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private SQL parameter');
  });

  it('4xx와 잘못된 route template은 발송하지 않는다', () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const notifier = new DiscordWebhookNotifier(WEBHOOK, fetchImpl);

    notifier.notify({ event: 'http_exception', errorId: ERROR_ID, statusCode: 429 });
    expect(fetchImpl).not.toHaveBeenCalled();

    notifier.notify({
      event: 'http_request_failed',
      errorId: ERROR_ID,
      statusCode: 503,
      routeTemplate: '/users/123?token=secret',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as {
      content: string;
    };
    expect(requestBody.content).not.toContain('/users/123');
    expect(requestBody.content).not.toContain('secret');
  });
});

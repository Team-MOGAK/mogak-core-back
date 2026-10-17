import { URL } from 'node:url';

export const DISCORD_TIMEOUT_MS = 5_000;
export const RATE_LIMIT_FALLBACK_MS = 60_000;
export const MAX_RATE_LIMIT_MS = 24 * 60 * 60 * 1_000;

export class DiscordConfigError extends Error {
  constructor(message: string) {
    super(`Invalid Discord configuration: ${message}`);
    this.name = 'DiscordConfigError';
  }
}

export function validateDiscordWebhookUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DiscordConfigError('must be a valid URL');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'discord.com') {
    throw new DiscordConfigError('must use the canonical https://discord.com host');
  }
  if (parsed.username !== '' || parsed.password !== '' || parsed.port !== '') {
    throw new DiscordConfigError('must not contain credentials or a port');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new DiscordConfigError('must not contain a query or fragment');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (
    parsed.pathname.endsWith('/') ||
    segments.length !== 4 ||
    segments[0] !== 'api' ||
    segments[1] !== 'webhooks' ||
    !/^\d{1,30}$/.test(segments[2] ?? '') ||
    !/^[A-Za-z0-9_.-]{1,256}$/.test(segments[3] ?? '')
  ) {
    throw new DiscordConfigError('must use the /api/webhooks/{numeric-id}/{token} path');
  }

  return parsed.toString();
}

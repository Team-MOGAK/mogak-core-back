import type { AlertSummary } from '../application/type/alert.type.js';

export type DiscordPayload = Readonly<{
  content: string;
  allowed_mentions: Readonly<{
    parse: readonly [];
  }>;
}>;

const MAX_CONTENT_LENGTH = 1_800;

export function buildDiscordPayload(summary: AlertSummary): DiscordPayload {
  const lines = [
    `🚨 ${summary.eventSummary}`,
    `Environment: ${summary.environment}`,
    `Service: ${summary.service}`,
    `Error ID: ${summary.errorId}`,
    `Time: ${summary.timestamp}`,
    ...(summary.statusCode === undefined ? [] : [`Status: ${summary.statusCode}`]),
    ...(summary.appCode === undefined
      ? []
      : [`App code: ${summary.appCode} (${summary.appCodeSummary})`]),
    ...(summary.method === undefined ? [] : [`Method: ${summary.method}`]),
    ...(summary.routeTemplate === undefined ? [] : [`Route: ${summary.routeTemplate}`]),
    `Logs: ${summary.source.href}`,
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

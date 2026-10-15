import {
  KNOWN_ROUTE_TEMPLATES,
  routeTemplate,
  type AlertSummary,
} from '../application/contracts.js';

export type DiscordPayload = Readonly<{
  content: string;
  allowed_mentions: Readonly<{
    parse: readonly [];
  }>;
}>;

const MAX_CONTENT_LENGTH = 1_800;

export { KNOWN_ROUTE_TEMPLATES, routeTemplate };

export function buildDiscordPayload(summary: AlertSummary): DiscordPayload {
  const lines = [
    `🚨 ${summary.eventSummary}`,
    `Environment: ${summary.environment}`,
    `Service: ${summary.service}`,
    ...(summary.revision === undefined ? [] : [`Revision: ${summary.revision}`]),
    `Error ID: ${summary.errorId}`,
    ...(summary.timestamp === undefined ? [] : [`Time: ${summary.timestamp}`]),
    ...(summary.statusCode === undefined ? [] : [`Status: ${summary.statusCode}`]),
    ...(summary.appCode === undefined
      ? []
      : [`App code: ${summary.appCode} (${summary.appCodeSummary})`]),
    ...(summary.method === undefined ? [] : [`Method: ${summary.method}`]),
    ...(summary.route === undefined ? [] : [`Route: ${summary.route}`]),
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


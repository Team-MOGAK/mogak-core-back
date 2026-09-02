import { jest } from '@jest/globals';
import type { PinoLogger } from 'nestjs-pino';

export function pinoLoggerStub(): PinoLogger {
  return { warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
}

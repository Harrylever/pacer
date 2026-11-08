import { ConsoleLogger } from '@nestjs/common';

/** What every backend log line starts with, instead of Nest's default "[Nest]". */
export const LOG_PREFIX = 'PacerBackend';

export function createAppLogger(): ConsoleLogger {
  return new ConsoleLogger({ prefix: LOG_PREFIX });
}

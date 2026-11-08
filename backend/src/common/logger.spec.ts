import { createAppLogger, LOG_PREFIX } from './logger';

describe('createAppLogger', () => {
  it('prefixes every line with [PacerBackend], never [Nest]', () => {
    const lines: string[] = [];
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        lines.push(String(chunk));
        return true;
      });
    try {
      const logger = createAppLogger();
      logger.log('hello', 'SomeContext');
      logger.warn('careful', 'SomeContext');
    } finally {
      spy.mockRestore();
    }
    const out = lines.join('');
    expect(LOG_PREFIX).toBe('PacerBackend');
    expect(out).toContain('[PacerBackend]');
    expect(out).not.toContain('[Nest]');
    expect(out).toContain('[SomeContext]');
    expect(out).toContain('hello');
  });
});

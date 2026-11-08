import { pollWithBackoff } from './polling';

describe('pollWithBackoff', () => {
  it('logs one conflict line per 409 and backs off exponentially', async () => {
    let starts = 0;
    const conflicts: string[] = [];
    const delays: number[] = [];
    await pollWithBackoff({
      start: async () => {
        starts++;
        if (starts <= 2) throw new Error('409: Conflict');
      },
      shouldContinue: () => true,
      onConflict: () => conflicts.push('conflict'),
      onError: () => conflicts.push('error'),
      sleep: async (ms) => {
        delays.push(ms);
      },
      baseDelayMs: 100,
      maxDelayMs: 250,
    });
    // Third start succeeds (returns), so polling ran to a clean exit.
    expect(starts).toBe(3);
    expect(conflicts).toEqual(['conflict', 'conflict']);
    expect(delays).toEqual([100, 200]);
  });

  it('stops retrying when shutdown is signalled', async () => {
    let alive = true;
    let starts = 0;
    const done = pollWithBackoff({
      start: async () => {
        starts++;
        alive = false;
        throw new Error('boom');
      },
      shouldContinue: () => alive,
      onConflict: () => undefined,
      onError: () => undefined,
      sleep: async () => undefined,
    });
    await done;
    expect(starts).toBe(1);
  });
});

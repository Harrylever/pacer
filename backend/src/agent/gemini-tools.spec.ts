import {
  createGeminiToolCall,
  geminiToolDeclarations,
  type FetchLike,
} from './gemini-tools';

describe('Gemini tool declarations', () => {
  it('declares every registry tool as a function', () => {
    const decls = geminiToolDeclarations() as {
      type: string;
      name: string;
      parameters?: unknown;
    }[];
    expect(decls.length).toBeGreaterThanOrEqual(11);
    expect(decls.every((d) => d.type === 'function')).toBe(true);
    expect(decls.map((d) => d.name)).toContain('propose_plan');
  });
});

describe('createGeminiToolCall', () => {
  it('sends tools + forced tool_choice and parses function_call steps', async () => {
    const calls: { url: string; init: Record<string, unknown> }[] = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'int-1',
          steps: [
            {
              type: 'function_call',
              id: 'call-1',
              name: 'propose_pause',
              arguments: {},
            },
            { type: 'model_output', content: [{ type: 'text', text: 'hi' }] },
          ],
        }),
      };
    };
    const call = createGeminiToolCall({ apiKey: 'k', model: 'gemini-test', fetchFn });
    const r = await call({ input: 'pause please' });
    expect(r.id).toBe('int-1');
    expect(r.calls).toEqual([
      { id: 'call-1', name: 'propose_pause', arguments: {} },
    ]);
    const body = JSON.parse((calls[0].init as { body: string }).body);
    expect(body.model).toBe('gemini-test');
    expect(body.generation_config.tool_choice.allowed_tools.mode).toBe('any');
    expect(body.tools[0].type).toBe('function');
  });

  it('aborts after the 5s default budget (configurable)', async () => {
    const fetchFn: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = (init as { signal?: AbortSignal }).signal;
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(
      createGeminiToolCall({ apiKey: 'k', model: 'm', fetchFn, timeoutMs: 20 })({
        input: 'x',
      }),
    ).rejects.toThrow('aborted');
  });

  it('throws on HTTP 500', async () => {
    const fetchFn: FetchLike = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(
      createGeminiToolCall({ apiKey: 'k', model: 'm', fetchFn })({ input: 'x' }),
    ).rejects.toThrow('gemini http 500');
  });
});

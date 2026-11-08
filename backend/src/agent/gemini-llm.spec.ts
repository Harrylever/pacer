import { createGeminiLlmCall, type FetchLike } from './gemini-llm';

function fetchReturning(body: unknown, ok = true, status = 200) {
  const calls: { url: string; init: Record<string, unknown> }[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    return { ok, status, json: async () => body };
  };
  return { fetchFn, calls };
}

describe('GeminiLlmCall (Interactions API, structured output)', () => {
  it('sends only the user message, delimited, with the JSON schema', async () => {
    const { fetchFn, calls } = fetchReturning({
      output_text: '{"type":"pause"}',
    });
    const call = createGeminiLlmCall({
      apiKey: 'test-key',
      model: 'gemini-test',
      fetchFn,
    });
    await expect(call('abeg pause am')).resolves.toBe('{"type":"pause"}');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    const init = calls[0].init as {
      headers: Record<string, string>;
      body: string;
    };
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    expect(init.headers['Api-Revision']).toBe('2026-05-20');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['input', 'model', 'response_format']);
    expect(body.model).toBe('gemini-test');
    expect(body.response_format).toMatchObject({
      type: 'text',
      mime_type: 'application/json',
    });
    const input = body.input as string;
    expect(input).toContain('<user_message>\nabeg pause am\n</user_message>');
    // Nothing else about the user is sent: no balances, addresses or keys.
    expect(input).not.toContain('balance:');
    expect(input).not.toContain('ownerPublicKey');
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('throws on HTTP 500 and on a body with no output text', async () => {
    const http = fetchReturning({}, false, 500);
    await expect(
      createGeminiLlmCall({ apiKey: 'k', model: 'm', fetchFn: http.fetchFn })('hi'),
    ).rejects.toThrow('gemini http 500');
    const empty = fetchReturning({ status: 'complete' });
    await expect(
      createGeminiLlmCall({ apiKey: 'k', model: 'm', fetchFn: empty.fetchFn })('hi'),
    ).rejects.toThrow('gemini: no output text');
  });

  it('times out after the configured budget', async () => {
    const fetchFn: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = (init as { signal?: AbortSignal }).signal;
        signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });
    await expect(
      createGeminiLlmCall({ apiKey: 'k', model: 'm', fetchFn, timeoutMs: 20 })('hi'),
    ).rejects.toThrow();
  });
});

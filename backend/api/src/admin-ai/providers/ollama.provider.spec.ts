import { loadAdminAiConfig } from '../admin-ai.config';
import { configService, testConfig } from '../testing/admin-ai-test-utils';
import { AiProviderError, type AiModelRequest } from './model-provider.interface';
import { OllamaModelProvider, normalizeError, toOllamaMessages, type OllamaAssistantTurn } from './adapters/ollama.provider';
import { ModelGatewayService } from './model-gateway.service';

/** A fetch Response whose body streams the given NDJSON lines, split at awkward points. */
function ndjsonResponse(chunks: object[], status = 200): Response {
  const text = chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n';
  const encoder = new TextEncoder();
  const pieces = [text.slice(0, 7), text.slice(7, text.length - 3), text.slice(text.length - 3)];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pieces.forEach((piece) => controller.enqueue(encoder.encode(piece)));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const EMPTY: AiModelRequest = { system: 's', messages: [], tools: [], maxOutputTokens: 10 };

describe('OllamaModelProvider', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('is configured by default (local Ollama) and refuses without a usable base URL', async () => {
    expect(new OllamaModelProvider(configService(testConfig())).isConfigured()).toBe(true);

    const provider = new OllamaModelProvider(configService(testConfig({ baseUrl: undefined })));
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generate(EMPTY, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams text, returns tool calls with generated ids, and sends the request in Ollama format', async () => {
    fetchMock.mockResolvedValue(
      ndjsonResponse([
        { model: 'llama3.1:8b', message: { role: 'assistant', content: 'Look' }, done: false },
        { model: 'llama3.1:8b', message: { role: 'assistant', content: 'ing.' }, done: false },
        {
          model: 'llama3.1:8b',
          message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'beds__getOccupancy', arguments: { a: 1 } } }] },
          done: false,
        },
        { model: 'llama3.1:8b', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 15, eval_count: 7 },
      ]),
    );
    const provider = new OllamaModelProvider(
      configService(testConfig({ baseUrl: 'http://ollama.local:11434', model: 'llama3.1:8b', contextTokens: 8192, apiKey: 'proxy-token' })),
    );
    const deltas: string[] = [];
    const signal = new AbortController().signal;

    const result = await provider.generate(
      {
        system: 'SYSTEM',
        tools: [{ name: 'beds__getOccupancy', description: 'd', inputSchema: { type: 'object', properties: {} } }],
        messages: [{ role: 'user', content: 'hi' }],
        maxOutputTokens: 500,
      },
      { signal, onTextDelta: (d) => deltas.push(d) },
    );

    expect(deltas).toEqual(['Look', 'ing.']);
    expect(result).toMatchObject({
      text: 'Looking.',
      toolCalls: [{ name: 'beds__getOccupancy', input: { a: 1 } }],
      stopReason: 'tool_use',
      usage: { inputTokens: 15, outputTokens: 7 },
      model: 'llama3.1:8b',
    });
    const turn = result.providerContent as OllamaAssistantTurn;
    expect(turn.callIds).toEqual([result.toolCalls[0].id]);
    expect(turn.message).toEqual({
      role: 'assistant',
      content: 'Looking.',
      tool_calls: [{ function: { name: 'beds__getOccupancy', arguments: { a: 1 } } }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama.local:11434/api/chat');
    expect(init.signal).toBe(signal);
    expect(init.headers.Authorization).toBe('Bearer proxy-token');
    expect(JSON.parse(init.body)).toEqual({
      model: 'llama3.1:8b',
      stream: true,
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'hi' },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'beds__getOccupancy', description: 'd', parameters: { type: 'object', properties: {} } },
        },
      ],
      options: { num_predict: 500, num_ctx: 8192 },
    });
  });

  it('sends no Authorization header when no key is configured', async () => {
    fetchMock.mockResolvedValue(ndjsonResponse([{ message: { content: 'ok' }, done: true, done_reason: 'stop' }]));
    const provider = new OllamaModelProvider(configService(testConfig({ apiKey: undefined })));
    const result = await provider.generate(EMPTY, { signal: new AbortController().signal });
    expect(result.stopReason).toBe('end_turn');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('maps done_reason "length" to max_tokens', async () => {
    fetchMock.mockResolvedValue(ndjsonResponse([{ message: { content: 'cut' }, done: true, done_reason: 'length' }]));
    const provider = new OllamaModelProvider(configService(testConfig()));
    await expect(provider.generate(EMPTY, { signal: new AbortController().signal })).resolves.toMatchObject({
      stopReason: 'max_tokens',
    });
  });

  it('retries a refused connection and a 503, then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(ndjsonResponse([{ message: { content: 'ok' }, done: true, done_reason: 'stop' }]));
    const provider = new OllamaModelProvider(configService(testConfig({ maxRetries: 2 })));
    jest.useFakeTimers();
    try {
      const pending = provider.generate(EMPTY, { signal: new AbortController().signal });
      await jest.runAllTimersAsync();
      await expect(pending).resolves.toMatchObject({ text: 'ok' });
    } finally {
      jest.useRealTimers();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports a missing model as bad_request without retrying', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"model not found"}', { status: 404 }));
    const provider = new OllamaModelProvider(configService(testConfig({ model: 'missing:1b', maxRetries: 2 })));
    await expect(provider.generate(EMPTY, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'bad_request',
      message: expect.stringContaining('missing:1b'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable server as unavailable once retries run out', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const provider = new OllamaModelProvider(configService(testConfig({ maxRetries: 0 })));
    await expect(provider.generate(EMPTY, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('rejects a stream that ends without a final chunk or reports an error', async () => {
    const provider = new OllamaModelProvider(configService(testConfig()));
    fetchMock.mockResolvedValueOnce(ndjsonResponse([{ message: { content: 'partial' }, done: false }]));
    await expect(provider.generate(EMPTY, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'unavailable',
    });
    fetchMock.mockResolvedValueOnce(ndjsonResponse([{ error: 'out of memory: secret details' }]));
    const failure = provider.generate(EMPTY, { signal: new AbortController().signal });
    await expect(failure).rejects.toMatchObject({ code: 'unavailable' });
    await expect(failure).rejects.not.toMatchObject({ message: expect.stringContaining('secret') });
  });

  it('reports cancellation when the signal is aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
    const provider = new OllamaModelProvider(configService(testConfig({ maxRetries: 2 })));
    await expect(provider.generate(EMPTY, { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('toOllamaMessages', () => {
  it('replays assistant turns verbatim and names each tool result after the call that requested it', () => {
    const turn: OllamaAssistantTurn = {
      message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'beds__getOccupancy', arguments: {} } }] },
      callIds: ['ollama_call_1'],
    };
    const messages = toOllamaMessages({
      system: 'SYSTEM',
      tools: [],
      maxOutputTokens: 1,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', providerContent: turn },
        {
          role: 'user',
          content: [
            { type: 'tool_result', toolCallId: 'ollama_call_1', content: '{"free":3}' },
            { type: 'tool_result', toolCallId: 'unknown', content: 'denied', isError: true },
            { type: 'text', text: 'and the rest?' },
          ],
        },
        { role: 'assistant', content: 'plain history' },
      ],
    });

    expect(messages).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'hi' },
      turn.message,
      { role: 'tool', content: '{"free":3}', tool_name: 'beds__getOccupancy' },
      { role: 'tool', content: 'Error: denied' },
      { role: 'user', content: 'and the rest?' },
      { role: 'assistant', content: 'plain history' },
    ]);
  });
});

describe('normalizeError', () => {
  it.each([
    [new TypeError('fetch failed'), 'unavailable'],
    [Object.assign(new Error('x'), { name: 'AbortError' }), 'cancelled'],
    [new Error('boom'), 'unknown'],
  ])('maps %p to %s with a safe message', (error, code) => {
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(AiProviderError);
    expect(normalized.code).toBe(code);
    expect(normalized.message).not.toContain('boom');
  });
});

describe('loadAdminAiConfig (Ollama settings)', () => {
  it('defaults to a local Ollama and rejects a non-http base URL', () => {
    expect(loadAdminAiConfig({})).toMatchObject({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      contextTokens: 16_384,
    });
    expect(loadAdminAiConfig({ AI_BASE_URL: 'http://gpu-box:11434/' }).baseUrl).toBe('http://gpu-box:11434');
    expect(loadAdminAiConfig({ AI_BASE_URL: 'file:///etc/passwd' }).baseUrl).toBeUndefined();
    expect(loadAdminAiConfig({ AI_BASE_URL: 'not a url' }).baseUrl).toBeUndefined();
  });
});

describe('ModelGatewayService', () => {
  it('selects the adapter named by AI_PROVIDER and refuses when none matches', async () => {
    const adapter = { name: 'ollama', isConfigured: () => true, generate: jest.fn().mockResolvedValue('ok') };
    const gateway = new ModelGatewayService(configService(testConfig({ provider: 'ollama' })), [adapter]);
    expect(gateway.isConfigured()).toBe(true);
    expect(gateway.providerName).toBe('ollama');

    const missing = new ModelGatewayService(configService(testConfig({ provider: 'other' })), [adapter]);
    expect(missing.isConfigured()).toBe(false);
    await expect(missing.generate(EMPTY, { signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });
});

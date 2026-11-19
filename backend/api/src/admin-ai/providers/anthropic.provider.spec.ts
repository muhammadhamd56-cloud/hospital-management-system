import Anthropic from '@anthropic-ai/sdk';
import { configService, testConfig } from '../testing/admin-ai-test-utils';
import { AiProviderError } from './model-provider.interface';
import { AnthropicModelProvider, normalizeError } from './adapters/anthropic.provider';
import { ModelGatewayService } from './model-gateway.service';

function fakeStream(message: unknown, deltas: string[] = []) {
  const handlers: Record<string, (d: string) => void> = {};
  return {
    on: (event: string, handler: (d: string) => void) => {
      handlers[event] = handler;
    },
    finalMessage: async () => {
      deltas.forEach((d) => handlers.text?.(d));
      return message;
    },
  };
}

describe('AnthropicModelProvider', () => {
  it('reports not configured without a key and never calls the API', async () => {
    const provider = new AnthropicModelProvider(configService(testConfig({ apiKey: undefined })));
    expect(provider.isConfigured()).toBe(false);
    await expect(
      provider.generate({ system: 's', messages: [], tools: [], maxOutputTokens: 10 }, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('maps requests and responses to the neutral contract, streams text, and enables refusal fallbacks', async () => {
    const provider = new AnthropicModelProvider(configService(testConfig({ model: 'claude-opus-5-5' })));
    const content = [
      { type: 'text', text: 'Looking.' },
      { type: 'tool_use', id: 'tu1', name: 'beds__getOccupancy', input: { a: 1 } },
    ];
    const stream = jest.fn().mockReturnValue(
      fakeStream(
        { content, stop_reason: 'tool_use', model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 0, output_tokens: 7 } },
        ['Look', 'ing.'],
      ),
    );
    (provider as unknown as { client: unknown }).client = { beta: { messages: { stream } } };
    const deltas: string[] = [];
    const signal = new AbortController().signal;

    const result = await provider.generate(
      {
        system: 'SYSTEM',
        tools: [{ name: 'beds__getOccupancy', description: 'd', inputSchema: { type: 'object', properties: {} } }],
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: '', providerContent: [{ type: 'text', text: 'prev' }] },
          { role: 'user', content: [{ type: 'tool_result', toolCallId: 'tu0', content: '{}', isError: false }] },
        ],
        maxOutputTokens: 500,
      },
      { signal, onTextDelta: (d) => deltas.push(d) },
    );

    expect(result).toMatchObject({
      text: 'Looking.',
      toolCalls: [{ id: 'tu1', name: 'beds__getOccupancy', input: { a: 1 } }],
      stopReason: 'tool_use',
      usage: { inputTokens: 15, outputTokens: 7 },
      providerContent: content,
    });
    expect(deltas).toEqual(['Look', 'ing.']);

    const [body, options] = stream.mock.calls[0];
    expect(options).toEqual({ signal });
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 500,
      system: [{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
    });
    expect(body).not.toHaveProperty('thinking');
    expect(body.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'prev' }] });
    expect(body.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 'tu0', content: '{}', is_error: false });
  });

  it('does not send the fallback beta for models that do not support it', async () => {
    const provider = new AnthropicModelProvider(configService(testConfig({ model: 'claude-haiku-5-5' })));
    const stream = jest.fn().mockReturnValue(fakeStream({ content: [], stop_reason: 'end_turn', model: 'm', usage: { input_tokens: 1, output_tokens: 1 } }));
    (provider as unknown as { client: unknown }).client = { beta: { messages: { stream } } };
    await provider.generate({ system: 's', messages: [], tools: [], maxOutputTokens: 10 }, { signal: new AbortController().signal });
    expect(stream.mock.calls[0][0]).not.toHaveProperty('fallbacks');
  });
});

describe('normalizeError', () => {
  const headers = new Headers();
  it.each([
    [new Anthropic.RateLimitError(429, undefined, 'x', headers), 'rate_limited'],
    [new Anthropic.AuthenticationError(401, undefined, 'x', headers), 'auth'],
    [new Anthropic.BadRequestError(400, undefined, 'x', headers), 'bad_request'],
    [new Anthropic.InternalServerError(500, undefined, 'x', headers), 'unavailable'],
    [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    [new Anthropic.APIUserAbortError(), 'cancelled'],
    [new Error('boom'), 'unknown'],
  ])('maps %p to %s with a safe message', (error, code) => {
    const normalized = normalizeError(error);
    expect(normalized).toBeInstanceOf(AiProviderError);
    expect(normalized.code).toBe(code);
    expect(normalized.message).not.toContain('boom');
  });
});

describe('ModelGatewayService', () => {
  it('selects the adapter named by AI_PROVIDER and refuses when none matches', async () => {
    const adapter = { name: 'anthropic', isConfigured: () => true, generate: jest.fn().mockResolvedValue('ok') };
    const gateway = new ModelGatewayService(configService(testConfig({ provider: 'anthropic' })), [adapter]);
    expect(gateway.isConfigured()).toBe(true);
    expect(gateway.providerName).toBe('anthropic');

    const missing = new ModelGatewayService(configService(testConfig({ provider: 'other' })), [adapter]);
    expect(missing.isConfigured()).toBe(false);
    await expect(
      missing.generate({ system: 's', messages: [], tools: [], maxOutputTokens: 1 }, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'not_configured' });
  });
});

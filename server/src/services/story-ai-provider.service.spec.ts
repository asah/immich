import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { AiProviderAdapter } from 'src/enum';
import { StoryAiProviderService } from 'src/services/story-ai-provider.service';
import { vitest } from 'vitest';

const request = {
  adapter: AiProviderAdapter.OpenAI,
  instruction: 'Use the classic theme',
  storyId: '11111111-1111-4111-8111-111111111111',
  revision: 2,
  credential: 'secret-key',
  model: 'test-model',
} as const;

const response = (commands: unknown, init?: ResponseInit) =>
  Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(commands) }] }] }, init);

describe(StoryAiProviderService.name, () => {
  const service = new StoryAiProviderService();

  afterEach(() => {
    vitest.unstubAllGlobals();
    vitest.useRealTimers();
  });

  it('uses the fixed Responses API with structured output, no storage, and optional low-detail thumbnails', async () => {
    const fetchMock = vitest
      .fn()
      .mockResolvedValue(response([{ op: 'story.setTheme', id: 'classic', version: 1 }], { status: 200 }));
    vitest.stubGlobal('fetch', fetchMock);

    await expect(
      service.propose({
        ...request,
        thumbnails: [{ mimeType: 'image/jpeg', base64: 'dGlueQ==' }],
      }),
    ).resolves.toEqual([{ op: 'story.setTheme', id: 'classic', version: 1 }]);

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options.headers).toEqual({ Authorization: 'Bearer secret-key', 'Content-Type': 'application/json' });
    expect(body).toMatchObject({
      model: 'test-model',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(body.input[0].content[1]).toEqual({
      type: 'input_image',
      image_url: 'data:image/jpeg;base64,dGlueQ==',
      detail: 'low',
    });
  });

  it('rejects output that does not match StoryCommand validation', async () => {
    vitest.stubGlobal('fetch', vitest.fn().mockResolvedValue(response([{ op: 'made.up' }], { status: 200 })));

    await expect(service.propose(request)).rejects.toThrow('invalid commands');
  });

  it('returns a sanitized error for non-success provider responses', async () => {
    vitest.stubGlobal('fetch', vitest.fn().mockResolvedValue(new Response('secret-key diagnostic', { status: 401 })));

    const error = await service.propose(request).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(String(error)).not.toContain('secret-key');
  });

  it('aborts requests after the bounded timeout', async () => {
    vitest.useFakeTimers();
    vitest.stubGlobal(
      'fetch',
      vitest.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      ),
    );

    const pending = expect(service.propose(request)).rejects.toBeInstanceOf(GatewayTimeoutException);
    await vitest.advanceTimersByTimeAsync(20_000);
    await pending;
  });

  it('rejects oversized responses before reading their body', async () => {
    vitest.stubGlobal(
      'fetch',
      vitest.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-length': '1000001' } })),
    );

    await expect(service.propose(request)).rejects.toThrow('too large');
  });
});

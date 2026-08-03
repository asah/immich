import { BadGatewayException, BadRequestException, GatewayTimeoutException, Injectable } from '@nestjs/common';
import { StoryCommand, StoryCommandSchema } from 'src/dtos/story.dto';
import { AiProviderAdapter } from 'src/enum';
import z from 'zod';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-5.6-sol';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const commandListSchema = z.array(StoryCommandSchema).min(1).max(100);

export type StoryAiThumbnail = { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };

export type StoryAiProviderRequest = {
  adapter: AiProviderAdapter | 'deterministic';
  instruction: string;
  storyId: string;
  revision: number;
  credential?: string;
  model?: string;
  thumbnails?: StoryAiThumbnail[];
};

@Injectable()
export class StoryAiProviderService {
  async propose(request: StoryAiProviderRequest): Promise<StoryCommand[]> {
    if (request.adapter === 'deterministic') {
      const theme = request.instruction.match(/theme\s*:\s*([\w-]+)/i)?.[1] ?? 'classic';
      return [{ op: 'story.setTheme', id: theme, version: 1 }];
    }
    if (request.adapter !== AiProviderAdapter.OpenAI) {
      throw new BadRequestException('Unsupported Story AI provider');
    }
    if (!request.credential) {
      throw new BadRequestException('Story AI provider credential is required');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${request.credential}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || DEFAULT_OPENAI_MODEL,
          store: false,
          instructions:
            'You edit an Immich Story. Return only commands matching the supplied schema. Do not invent asset, page, scene, or element IDs.',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: request.instruction,
                },
                ...(request.thumbnails ?? []).map((thumbnail) => ({
                  type: 'input_image',
                  image_url: `data:${thumbnail.mimeType};base64,${thumbnail.base64}`,
                  detail: 'low',
                })),
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'story_commands',
              strict: true,
              schema: z.toJSONSchema(commandListSchema, { target: 'draft-7' }),
            },
          },
        }),
      });
      if (!response.ok) {
        throw new BadGatewayException(`Story AI provider request failed (${response.status})`);
      }
      const payload = JSON.parse(await this.readBounded(response)) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      const text = payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'output_text')?.text;
      if (!text) {
        throw new BadGatewayException('Story AI provider returned no structured output');
      }
      const parsed = commandListSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        throw new BadGatewayException('Story AI provider returned invalid commands');
      }
      return parsed.data;
    } catch (error: unknown) {
      if (error instanceof BadGatewayException || error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GatewayTimeoutException('Story AI provider timed out');
      }
      throw new BadGatewayException('Story AI provider response could not be processed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readBounded(response: Response): Promise<string> {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new BadGatewayException('Story AI provider response is too large');
    }
    if (!response.body) {
      throw new BadGatewayException('Story AI provider returned an empty response');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BadGatewayException('Story AI provider response is too large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }
}

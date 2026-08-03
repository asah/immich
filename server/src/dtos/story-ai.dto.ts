import { createZodDto } from 'nestjs-zod';
import { StoryCommandBatchDto, StoryCommandResponseSchema, StoryCommandSchema } from 'src/dtos/story.dto';
import { AiProviderAdapter } from 'src/enum';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const uuid = z.uuidv4();
export class StoryAiProviderUpdateDto extends createZodDto(
  z.object({
    adapter: z.enum(AiProviderAdapter).default(AiProviderAdapter.OpenAI),
    approvedEndpointId: z.enum(['openai_public', 'local_admin']),
    model: z.string().min(1).max(200),
    enabled: z.boolean().default(true),
    credential: z.string().min(1).max(20_000).optional(),
  }),
) {}
export class StoryAiConsentDto extends createZodDto(
  z.object({ providerId: uuid, textAllowed: z.boolean(), thumbnailAllowed: z.boolean().default(false) }),
) {}
export class StoryAiDraftCreateDto extends createZodDto(
  z.object({ instruction: z.string().min(1).max(10_000), baseRevision: z.number().int().nonnegative() }),
) {}
export class StoryAiDraftApplyDto extends createZodDto(
  z.object({ clientMutationId: uuid, sessionId: uuid, clientSequence: z.number().int().nonnegative() }),
) {}
const StoryAiProviderResponseSchema = z.object({
  id: uuid,
  adapter: z.enum(AiProviderAdapter),
  approvedEndpointId: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  credentialFingerprint: z.string().nullable(),
  scope: z.enum(['server', 'user']),
});
export class StoryAiProviderResponseDto extends createZodDto(StoryAiProviderResponseSchema) {}
export class StoryAiConsentResponseDto extends createZodDto(
  z.object({ providerId: uuid, textAllowed: z.boolean(), thumbnailAllowed: z.boolean(), updatedAt: isoDatetimeToDate }),
) {}
export class StoryAiDraftResponseDto extends createZodDto(
  z.object({
    id: uuid,
    storyId: uuid,
    actorId: uuid,
    baseRevision: z.number().int().nonnegative(),
    commandSchemaVersion: z.number().int().positive(),
    commands: z.array(StoryCommandSchema),
    diff: z.record(z.string(), z.unknown()),
    expiresAt: isoDatetimeToDate,
    createdAt: isoDatetimeToDate,
    appliedRevisionId: uuid.nullable(),
  }),
) {}
export class StoryAiApplyResponseDto extends createZodDto(StoryCommandResponseSchema) {}

export type StoryAiMutation = Pick<StoryCommandBatchDto, 'clientMutationId' | 'sessionId' | 'clientSequence'>;

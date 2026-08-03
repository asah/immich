import { createZodDto } from 'nestjs-zod';
import { AlbumUserRole, AlbumUserRoleSchema, StoryAspectRatio, StoryAspectRatioSchema } from 'src/enum';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

const uuid = z.uuidv4();
const geometry = z.number().finite().multipleOf(0.001);
const frame = z.object({ x: geometry, y: geometry, width: geometry.positive(), height: geometry.positive() });
const border = z
  .object({
    width: geometry.min(0).max(100),
    style: z.enum(['solid', 'dashed', 'double']),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0).max(1),
  })
  .strict();
const animation = z
  .object({
    preset: z.enum(['fade', 'rise', 'slide', 'scale', 'pan_zoom']),
    startMs: z.number().int().min(0).max(60_000),
    durationMs: z.number().int().min(100).max(60_000),
    easing: z.enum(['linear', 'ease', 'ease_in', 'ease_out', 'ease_in_out']),
    reducedMotion: z.enum(['omit', 'fade', 'instant']),
  })
  .strict();
export const StoryElementSchema = z
  .object({
    id: uuid,
    type: z.enum(['image', 'video', 'text', 'sticker', 'shape']),
    frame,
    rotation: geometry.min(-180).max(180).default(0),
    assetId: uuid.optional(),
    text: z.string().max(20_000).optional(),
    style: z.record(z.string(), z.unknown()).default({}),
    border: border.nullable().optional(),
    animation: animation.nullable().optional(),
    videoPlayback: z
      .object({ mode: z.enum(['click', 'autoplay', 'delayed']), delayMs: z.number().int().min(0).max(60_000) })
      .strict()
      .optional(),
    ariaHidden: z.boolean().default(false),
    altText: z.string().max(1000).optional(),
  })
  .strict();

export const StorySceneSchema = z
  .object({
    id: uuid,
    template: z.string().min(1).max(100).default('blank'),
    background: z.string().default('theme'),
    durationMs: z.number().int().min(1000).max(60_000).default(6000),
    elements: z.array(StoryElementSchema).max(100).default([]),
    readingOrder: z.array(uuid).default([]),
  })
  .strict();

export const StoryDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.object({ id: z.string().min(1).max(100), version: z.number().int().positive() }).strict(),
    cover: StorySceneSchema,
    pages: z.array(StorySceneSchema).min(1).max(500),
    unplacedAssetIds: z.array(uuid).max(2000).default([]),
    curation: z.record(uuid, z.enum(['include', 'must_include', 'maybe', 'exclude'])).default({}),
  })
  .strict();

export const StoryCommandSchema = z.discriminatedUnion('op', [
  z
    .object({ op: z.literal('story.setTheme'), id: z.string().min(1).max(100), version: z.number().int().positive() })
    .strict(),
  z.object({ op: z.literal('page.insert'), page: StorySceneSchema, afterPageId: uuid.nullable().optional() }).strict(),
  z.object({ op: z.literal('page.remove'), pageId: uuid }).strict(),
  z.object({ op: z.literal('page.move'), pageId: uuid, afterPageId: uuid.nullable() }).strict(),
  z.object({ op: z.literal('scene.setTemplate'), sceneId: uuid, template: z.string().min(1).max(100) }).strict(),
  z.object({ op: z.literal('scene.setBackground'), sceneId: uuid, background: z.string().min(1).max(100) }).strict(),
  z
    .object({ op: z.literal('scene.setTiming'), sceneId: uuid, durationMs: z.number().int().min(1000).max(60_000) })
    .strict(),
  z.object({ op: z.literal('element.setBorder'), sceneId: uuid, elementId: uuid, border: border.nullable() }).strict(),
  z
    .object({ op: z.literal('element.setAnimation'), sceneId: uuid, elementId: uuid, animation: animation.nullable() })
    .strict(),
  z
    .object({
      op: z.literal('element.setTextStyle'),
      sceneId: uuid,
      elementId: uuid,
      style: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    })
    .strict(),
  z
    .object({
      op: z.literal('element.setVideoPlayback'),
      sceneId: uuid,
      elementId: uuid,
      mode: z.enum(['click', 'autoplay', 'delayed']),
      delayMs: z.number().int().min(0).max(60_000).default(0),
    })
    .strict(),
  z
    .object({
      op: z.literal('element.add'),
      sceneId: uuid,
      element: StoryElementSchema,
      afterElementId: uuid.nullable().optional(),
    })
    .strict(),
  z.object({ op: z.literal('element.remove'), sceneId: uuid, elementId: uuid }).strict(),
  z
    .object({
      op: z.literal('element.patchGeometry'),
      sceneId: uuid,
      elementId: uuid,
      frame,
      rotation: geometry.min(-180).max(180).optional(),
    })
    .strict(),
  z.object({ op: z.literal('element.setText'), sceneId: uuid, elementId: uuid, text: z.string().max(20_000) }).strict(),
  z
    .object({
      op: z.literal('element.setAccessibility'),
      sceneId: uuid,
      elementId: uuid,
      ariaHidden: z.boolean(),
      altText: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({ op: z.literal('element.moveLayer'), sceneId: uuid, elementId: uuid, afterElementId: uuid.nullable() })
    .strict(),
  z.object({ op: z.literal('scene.setReadingOrder'), sceneId: uuid, elementIds: z.array(uuid).max(100) }).strict(),
  z.object({ op: z.literal('tray.addAssets'), assetIds: z.array(uuid).min(1).max(2000) }).strict(),
  z.object({ op: z.literal('tray.removeAssets'), assetIds: z.array(uuid).min(1).max(2000) }).strict(),
  z
    .object({
      op: z.literal('curation.setStates'),
      states: z
        .array(z.object({ assetId: uuid, state: z.enum(['include', 'must_include', 'maybe', 'exclude']) }).strict())
        .min(1)
        .max(2000),
    })
    .strict(),
]);

export const StoryCreateSchema = z.object({
  title: z.string().min(1).max(200).default('Untitled Story'),
  description: z.string().max(10_000).default(''),
  aspectRatio: StoryAspectRatioSchema.default(StoryAspectRatio.Portrait),
});

export class StoryCreateDto extends createZodDto(StoryCreateSchema) {}
export class StoryUpdateDto extends createZodDto(StoryCreateSchema.partial()) {}
export class StoryCommandBatchDto extends createZodDto(
  z.object({
    baseRevision: z.number().int().nonnegative(),
    clientMutationId: uuid,
    sessionId: uuid,
    clientSequence: z.number().int().nonnegative(),
    commands: z.array(StoryCommandSchema).min(1).max(100),
  }),
) {}
export class StoryRevisionNameDto extends createZodDto(
  z.object({ name: z.string().trim().min(1).max(100).nullable() }),
) {}
export class StoryRevisionSearchDto extends createZodDto(
  z.object({
    before: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
) {}
export class StoryUserAddDto extends createZodDto(
  z.object({ userId: uuid, role: AlbumUserRoleSchema.default(AlbumUserRole.Editor) }),
) {}
export class StoryUserUpdateDto extends createZodDto(z.object({ role: AlbumUserRoleSchema })) {}
export class StoryImportDto extends createZodDto(
  z.object({
    albumIds: z.array(uuid).max(100).default([]),
    assetIds: z.array(uuid).max(2000).default([]),
    mode: z.enum(['tray', 'one_per_page', 'automatic_draft']).default('tray'),
  }),
) {}

export const StoryResponseSchema = z.object({
  id: uuid,
  title: z.string(),
  description: z.string(),
  aspectRatio: StoryAspectRatioSchema,
  role: AlbumUserRoleSchema,
  draftRevisionId: uuid,
  draftRevision: z.number().int().nonnegative(),
  publishedRevisionId: uuid.nullable(),
  hasUnpublishedChanges: z.boolean(),
  createdAt: isoDatetimeToDate,
  updatedAt: isoDatetimeToDate,
});

export class StoryResponseDto extends createZodDto(StoryResponseSchema) {}
export class StoryDocumentResponseDto extends createZodDto(
  z.object({ revisionId: uuid, revision: z.number().int().nonnegative(), document: StoryDocumentSchema }),
) {}
export const StoryCommandResponseSchema = z.object({
  revisionId: uuid,
  revision: z.number().int().nonnegative(),
  document: StoryDocumentSchema,
});
export class StoryCommandResponseDto extends createZodDto(StoryCommandResponseSchema) {}
export class StoryRevisionResponseDto extends createZodDto(
  z.object({
    id: uuid,
    revision: z.number().int().nonnegative(),
    schemaVersion: z.number().int().positive(),
    actorId: uuid.nullable(),
    source: z.string(),
    summary: z.string(),
    name: z.string().nullable(),
    createdAt: isoDatetimeToDate,
  }),
) {}
export class StoryUserResponseDto extends createZodDto(z.object({ userId: uuid, role: AlbumUserRoleSchema })) {}
export class StoryRevisionDetailResponseDto extends createZodDto(
  z.object({
    id: uuid,
    storyId: uuid,
    revision: z.number().int().nonnegative(),
    schemaVersion: z.number().int().positive(),
    document: StoryDocumentSchema,
    actorId: uuid.nullable(),
    source: z.string(),
    summary: z.string(),
    name: z.string().nullable(),
    createdAt: isoDatetimeToDate,
  }),
) {}
export class StoryRevisionCompareResponseDto extends createZodDto(
  z.object({
    fromRevision: z.number().int().nonnegative(),
    toRevision: z.number().int().nonnegative(),
    pageCountDelta: z.number().int(),
    assetCountDelta: z.number().int(),
    themeChanged: z.boolean(),
    changed: z.boolean(),
  }),
) {}
export class SharedStoryResponseDto extends createZodDto(
  z.object({
    story: z.object({ id: uuid, title: z.string(), description: z.string(), aspectRatio: StoryAspectRatioSchema }),
    revisionId: uuid,
    document: StoryDocumentSchema,
    resolvedStart: z.object({ pageId: uuid, offsetMs: z.number().int().nonnegative() }).optional(),
  }),
) {}

export type StoryDocument = z.infer<typeof StoryDocumentSchema>;
export type StoryCommand = z.infer<typeof StoryCommandSchema>;

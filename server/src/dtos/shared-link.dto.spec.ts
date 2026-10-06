import { SharedLinkCreateDto } from 'src/dtos/shared-link.dto';
import { SharedLinkType } from 'src/enum';

describe('SharedLinkCreateDto', () => {
  it('requires a story ID when sharing a story', () => {
    const result = SharedLinkCreateDto.schema.safeParse({ type: SharedLinkType.Story });
    expect(result.success).toBe(false);
  });

  it('accepts a story link with a valid story ID', () => {
    const result = SharedLinkCreateDto.schema.safeParse({
      type: SharedLinkType.Story,
      storyId: '3fe388e4-2078-44d7-b36c-39d9dee3a657',
    });
    expect(result.success).toBe(true);
  });
});

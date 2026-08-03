import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  StoryAiApplyResponseDto,
  StoryAiConsentDto,
  StoryAiConsentResponseDto,
  StoryAiDraftApplyDto,
  StoryAiDraftCreateDto,
  StoryAiDraftResponseDto,
  StoryAiProviderResponseDto,
  StoryAiProviderUpdateDto,
} from 'src/dtos/story-ai.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { StoryAiService } from 'src/services/story-ai.service';

@ApiTags(ApiTag.Stories)
@Controller('stories/ai')
export class StoryAiController {
  constructor(private service: StoryAiService) {}

  @Get('provider')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve the effective Story AI provider', history: new HistoryBuilder().added('v3') })
  getStoryAiProvider(@Auth() auth: AuthDto): Promise<StoryAiProviderResponseDto | null> {
    return this.service.getProvider(auth);
  }

  @Put('provider')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Configure a personal Story AI provider', history: new HistoryBuilder().added('v3') })
  updateStoryAiProvider(
    @Auth() auth: AuthDto,
    @Body() dto: StoryAiProviderUpdateDto,
  ): Promise<StoryAiProviderResponseDto> {
    return this.service.updateProvider(auth, dto);
  }

  @Delete('provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Remove a personal Story AI provider', history: new HistoryBuilder().added('v3') })
  deleteStoryAiProvider(@Auth() auth: AuthDto): Promise<void> {
    return this.service.deleteProvider(auth);
  }

  @Put('server-provider')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Configure the server Story AI provider', history: new HistoryBuilder().added('v3') })
  updateServerStoryAiProvider(
    @Auth() auth: AuthDto,
    @Body() dto: StoryAiProviderUpdateDto,
  ): Promise<StoryAiProviderResponseDto> {
    return this.service.updateProvider(auth, dto, true);
  }

  @Delete('server-provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Remove the server Story AI provider', history: new HistoryBuilder().added('v3') })
  deleteServerStoryAiProvider(@Auth() auth: AuthDto): Promise<void> {
    return this.service.deleteProvider(auth, true);
  }

  @Put('consent')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Set Story AI transmission consent', history: new HistoryBuilder().added('v3') })
  setStoryAiConsent(@Auth() auth: AuthDto, @Body() dto: StoryAiConsentDto): Promise<StoryAiConsentResponseDto> {
    return this.service.setConsent(auth, dto);
  }

  @Get('consent')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve Story AI transmission consent', history: new HistoryBuilder().added('v3') })
  getStoryAiConsent(@Auth() auth: AuthDto): Promise<StoryAiConsentResponseDto | null> {
    return this.service.getConsent(auth);
  }

  @Post(':storyId/drafts')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Create an immutable Story AI draft', history: new HistoryBuilder().added('v3') })
  createStoryAiDraft(
    @Auth() auth: AuthDto,
    @Param('storyId') storyId: string,
    @Body() dto: StoryAiDraftCreateDto,
  ): Promise<StoryAiDraftResponseDto> {
    return this.service.createDraft(auth, storyId, dto);
  }

  @Get(':storyId/drafts/:draftId')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve a Story AI draft', history: new HistoryBuilder().added('v3') })
  getStoryAiDraft(
    @Auth() auth: AuthDto,
    @Param('storyId') storyId: string,
    @Param('draftId') draftId: string,
  ): Promise<StoryAiDraftResponseDto> {
    return this.service.getDraft(auth, storyId, draftId);
  }

  @Post(':storyId/drafts/:draftId/apply')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Apply an immutable Story AI draft', history: new HistoryBuilder().added('v3') })
  applyStoryAiDraft(
    @Auth() auth: AuthDto,
    @Param('storyId') storyId: string,
    @Param('draftId') draftId: string,
    @Body() dto: StoryAiDraftApplyDto,
  ): Promise<StoryAiApplyResponseDto> {
    return this.service.applyDraft(auth, storyId, draftId, dto);
  }

  @Delete(':storyId/drafts/:draftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Delete a Story AI draft', history: new HistoryBuilder().added('v3') })
  deleteStoryAiDraft(
    @Auth() auth: AuthDto,
    @Param('storyId') storyId: string,
    @Param('draftId') draftId: string,
  ): Promise<void> {
    return this.service.deleteDraft(auth, storyId, draftId);
  }
}

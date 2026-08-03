import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Next,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NextFunction, Response } from 'express';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  SharedStoryResponseDto,
  StoryCommandBatchDto,
  StoryCommandResponseDto,
  StoryCreateDto,
  StoryDocumentResponseDto,
  StoryImportDto,
  StoryResponseDto,
  StoryRevisionCompareResponseDto,
  StoryRevisionDetailResponseDto,
  StoryRevisionNameDto,
  StoryRevisionResponseDto,
  StoryRevisionSearchDto,
  StoryUpdateDto,
  StoryUserAddDto,
  StoryUserResponseDto,
  StoryUserUpdateDto,
} from 'src/dtos/story.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { StoryService } from 'src/services/story.service';
import { sendFile } from 'src/utils/file';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Stories)
@Controller('stories')
export class StoryController {
  constructor(
    private service: StoryService,
    private logger: LoggingRepository,
  ) {}

  @Get('shared/assets/:id/rendition')
  @Authenticated({ sharedLink: true })
  @Endpoint({ summary: 'View a story-scoped asset rendition', history: new HistoryBuilder().added('v3') })
  async getSharedStoryRendition(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(response, next, () => this.service.getSharedRendition(auth, id), this.logger);
  }

  @Get('shared')
  @Authenticated({ sharedLink: true })
  @Endpoint({ summary: 'Retrieve the published shared Story', history: new HistoryBuilder().added('v3') })
  getSharedStory(@Auth() auth: AuthDto): Promise<SharedStoryResponseDto> {
    return this.service.getShared(auth);
  }

  @Get('shared/assets/:id/video')
  @Authenticated({ sharedLink: true })
  @Endpoint({ summary: 'Play a story-scoped video', history: new HistoryBuilder().added('v3') })
  async getSharedStoryVideo(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(response, next, () => this.service.getSharedVideo(auth, id), this.logger);
  }

  @Get('shared/assets/:id/original')
  @Authenticated({ sharedLink: true })
  @Endpoint({ summary: 'Download a story-scoped original', history: new HistoryBuilder().added('v3') })
  async downloadSharedStoryOriginal(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(response, next, () => this.service.downloadSharedOriginal(auth, id), this.logger);
  }

  @Get(':id/revisions/:revisionId/assets/:assetId/rendition')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'View a story revision asset rendition', history: new HistoryBuilder().added('v3') })
  async getStoryRevisionRendition(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(response, next, () => this.service.getRevisionRendition(auth, id, revisionId, assetId), this.logger);
  }

  @Get(':id/revisions/:revisionId/assets/:assetId/video')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Play a story revision video', history: new HistoryBuilder().added('v3') })
  async getStoryRevisionVideo(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(response, next, () => this.service.getRevisionVideo(auth, id, revisionId, assetId), this.logger);
  }

  @Post()
  @Authenticated({ permission: Permission.StoryCreate })
  @Endpoint({ summary: 'Create a story', history: new HistoryBuilder().added('v3') })
  createStory(@Auth() auth: AuthDto, @Body() dto: StoryCreateDto): Promise<StoryResponseDto> {
    return this.service.create(auth, dto);
  }

  @Get()
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve stories', history: new HistoryBuilder().added('v3') })
  getAllStories(@Auth() auth: AuthDto): Promise<StoryResponseDto[]> {
    return this.service.getAll(auth);
  }

  @Get(':id')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve a story', history: new HistoryBuilder().added('v3') })
  getStory(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<StoryResponseDto> {
    return this.service.get(auth, id);
  }

  @Patch(':id')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Update story metadata', history: new HistoryBuilder().added('v3') })
  updateStory(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: StoryUpdateDto,
  ): Promise<StoryResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.StoryDelete })
  @Endpoint({ summary: 'Delete a story', history: new HistoryBuilder().added('v3') })
  deleteStory(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.remove(auth, id);
  }

  @Get(':id/document')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve the current story document', history: new HistoryBuilder().added('v3') })
  getStoryDocument(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<StoryDocumentResponseDto> {
    return this.service.getDocument(auth, id);
  }

  @Post(':id/commands')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Apply story commands', history: new HistoryBuilder().added('v3') })
  applyStoryCommands(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: StoryCommandBatchDto,
  ): Promise<StoryCommandResponseDto> {
    return this.service.applyCommands(auth, id, dto);
  }

  @Post(':id/import')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Import assets into a story', history: new HistoryBuilder().added('v3') })
  importStoryAssets(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: StoryImportDto,
  ): Promise<StoryCommandResponseDto> {
    return this.service.importAssets(auth, id, dto);
  }

  @Get(':id/revisions')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve story revisions', history: new HistoryBuilder().added('v3') })
  getStoryRevisions(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() dto: StoryRevisionSearchDto,
  ): Promise<StoryRevisionResponseDto[]> {
    return this.service.getRevisions(auth, id, dto);
  }

  @Post(':id/duplicate')
  @Authenticated({ permission: Permission.StoryCreate })
  @Endpoint({ summary: 'Duplicate a story', history: new HistoryBuilder().added('v3') })
  duplicateStory(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<StoryResponseDto> {
    return this.service.duplicate(auth, id);
  }

  @Post(':id/restore')
  @Authenticated({ permission: Permission.StoryDelete })
  @Endpoint({ summary: 'Restore a deleted story', history: new HistoryBuilder().added('v3') })
  restoreDeletedStory(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<StoryResponseDto> {
    return this.service.restoreDeleted(auth, id);
  }

  @Get(':id/revisions/:revisionId/compare/:toRevisionId')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Compare story revisions', history: new HistoryBuilder().added('v3') })
  compareStoryRevisions(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Param('toRevisionId') toRevisionId: string,
  ): Promise<StoryRevisionCompareResponseDto> {
    return this.service.compareRevisions(auth, id, revisionId, toRevisionId);
  }

  @Get(':id/revisions/:revisionId')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve a story revision', history: new HistoryBuilder().added('v3') })
  getStoryRevision(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ): Promise<StoryRevisionDetailResponseDto> {
    return this.service.getRevision(auth, id, revisionId);
  }

  @Patch(':id/revisions/:revisionId')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Name a story revision', history: new HistoryBuilder().added('v3') })
  nameStoryRevision(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: StoryRevisionNameDto,
  ): Promise<StoryRevisionDetailResponseDto> {
    return this.service.nameRevision(auth, id, revisionId, dto);
  }

  @Post(':id/revisions/:revisionId/restore')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Restore a story revision', history: new HistoryBuilder().added('v3') })
  restoreStoryRevision(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ): Promise<StoryCommandResponseDto> {
    return this.service.restoreRevision(auth, id, revisionId);
  }

  @Post(':id/publish')
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Publish a story', history: new HistoryBuilder().added('v3') })
  publishStory(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<StoryResponseDto> {
    return this.service.publish(auth, id);
  }

  @Delete(':id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.StoryUpdate })
  @Endpoint({ summary: 'Unpublish a story', history: new HistoryBuilder().added('v3') })
  unpublishStory(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.unpublish(auth, id);
  }

  @Get(':id/users')
  @Authenticated({ permission: Permission.StoryRead })
  @Endpoint({ summary: 'Retrieve story collaborators', history: new HistoryBuilder().added('v3') })
  getStoryUsers(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<StoryUserResponseDto[]> {
    return this.service.getUsers(auth, id);
  }

  @Put(':id/users')
  @Authenticated({ permission: Permission.StoryShare })
  @Endpoint({ summary: 'Add a story collaborator', history: new HistoryBuilder().added('v3') })
  addStoryUser(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: StoryUserAddDto,
  ): Promise<StoryUserResponseDto[]> {
    return this.service.addUser(auth, id, dto);
  }

  @Patch(':id/users/:userId')
  @Authenticated({ permission: Permission.StoryShare })
  @Endpoint({ summary: 'Update a story collaborator', history: new HistoryBuilder().added('v3') })
  updateStoryUser(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: StoryUserUpdateDto,
  ): Promise<StoryUserResponseDto[]> {
    return this.service.updateUser(auth, id, userId, dto);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated({ permission: Permission.StoryShare })
  @Endpoint({ summary: 'Remove a story collaborator', history: new HistoryBuilder().added('v3') })
  removeStoryUser(@Auth() auth: AuthDto, @Param('id') id: string, @Param('userId') userId: string): Promise<void> {
    return this.service.removeUser(auth, id, userId);
  }
}

import { Body, Controller, Get, Param, Put, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { AlbumVoteDto, AlbumVoteLeaderboardDto, AlbumVoteParamDto, AlbumVoteSessionDto } from 'src/dtos/album-vote.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { AlbumVoteService } from 'src/services/album-vote.service';
import { UUIDParamDto } from 'src/validation';
import { randomBytes } from 'node:crypto';

const cookieName = 'immich_album_vote';

@ApiTags(ApiTag.Albums)
@Controller('albums')
export class AlbumVoteController {
  constructor(private service: AlbumVoteService) {}

  private token(auth: AuthDto, req: Request, res: Response) {
    if (!auth.sharedLink) return undefined;
    let token = req.cookies?.[cookieName] as string | undefined;
    if (!token) {
      token = randomBytes(32).toString('base64url');
      res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
    }
    return token;
  }

  @Get(':id/voting/session')
  @Authenticated({ permission: Permission.AlbumRead, sharedLink: true })
  @Endpoint({ summary: 'Get a personal album voting sample', history: new HistoryBuilder().added('v3') })
  getAlbumVotingSession(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AlbumVoteSessionDto> {
    return this.service.getSession(auth, id, this.token(auth, req, res));
  }

  @Put(':id/voting/votes/:assetId')
  @Authenticated({ permission: Permission.AlbumRead, sharedLink: true })
  @Endpoint({ summary: 'Cast or remove an album vote', history: new HistoryBuilder().added('v3') })
  async voteForAlbum(@Auth() auth: AuthDto, @Param() { id, assetId }: AlbumVoteParamDto, @Body() dto: AlbumVoteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.service.cast(auth, id, assetId, dto, this.token(auth, req, res));
  }

  @Get(':id/voting/leaderboard')
  @Authenticated({ permission: Permission.AlbumRead, sharedLink: true })
  @Endpoint({ summary: 'Get album voting leaderboard', history: new HistoryBuilder().added('v3') })
  getAlbumVotingLeaderboard(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AlbumVoteLeaderboardDto> {
    return this.service.getLeaderboard(auth, id, this.token(auth, req, res));
  }
}

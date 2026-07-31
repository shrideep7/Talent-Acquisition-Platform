import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AnalysesService } from './analyses.service';

class RunAnalysisDto {
  @IsString()
  @MinLength(1)
  jdId!: string;

  @IsString()
  @MinLength(1)
  cvDocumentId!: string;
}

@ApiTags('analyses')
@ApiBearerAuth()
@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analysesService: AnalysesService) {}

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Run the match-scoring engine for a JD + CV document pair' })
  run(@Body() dto: RunAnalysisDto, @CurrentUser() user: AuthUser) {
    return this.analysesService.run(dto.jdId, dto.cvDocumentId, user);
  }

  @Get()
  @ApiOperation({ summary: 'List analyses (newest first), filterable by ?jdId= and ?candidateId=' })
  list(@Query('jdId') jdId?: string, @Query('candidateId') candidateId?: string) {
    return this.analysesService.list(jdId, candidateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single analysis with its full score breakdown' })
  get(@Param('id') id: string) {
    return this.analysesService.get(id);
  }
}

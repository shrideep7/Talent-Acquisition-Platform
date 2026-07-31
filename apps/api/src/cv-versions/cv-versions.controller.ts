import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsObject, IsUUID, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CvVersionsService } from './cv-versions.service';

class GenerateCvVersionDto {
  @IsUUID()
  jdId!: string;

  @IsUUID()
  candidateId!: string;

  @IsUUID()
  cvDocumentId!: string;

  @IsInt()
  @Min(50)
  @Max(100)
  targetScore!: number;
}

class UpdateCvVersionDto {
  /** GeneratedCv JSON — validated against GeneratedCvSchema in the service. */
  @IsObject()
  content!: Record<string, unknown>;
}

@ApiTags('cv-versions')
@ApiBearerAuth()
@Controller('cv-versions')
export class CvVersionsController {
  constructor(private readonly cvVersionsService: CvVersionsService) {}

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Generate an ATS-optimized CV version for a JD from a source CV document (integrity-checked, re-scored)',
  })
  generate(@Body() dto: GenerateCvVersionDto, @CurrentUser() user: AuthUser) {
    return this.cvVersionsService.generate(dto, user);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary: 'Edit a generated CV version (content re-validated, integrity-checked, re-scored)',
  })
  update(@Param('id') id: string, @Body() dto: UpdateCvVersionDto, @CurrentUser() user: AuthUser) {
    return this.cvVersionsService.updateContent(id, dto.content, user);
  }

  @Get()
  @ApiOperation({ summary: 'CV version history (newest first), filter by ?candidateId= and ?jdId=' })
  list(@Query('candidateId') candidateId?: string, @Query('jdId') jdId?: string) {
    return this.cvVersionsService.list(candidateId, jdId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single CV version with full content, change log, and integrity notes' })
  getOne(@Param('id') id: string) {
    return this.cvVersionsService.getOne(id);
  }
}

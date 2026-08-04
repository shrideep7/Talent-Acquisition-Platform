import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CANDIDATE_SOURCES, CONSENT_STATUSES, PIPELINE_STAGES } from '@mfd/shared';
import type { CandidateSource, ConsentStatus, PipelineStage } from '@mfd/shared';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CandidatesService } from './candidates.service';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

/** Repeatable query params arrive as string | string[] — normalize to array. */
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter(Boolean);
}

function toEnumArray<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  const set = new Set<string>(allowed);
  return toArray(value).filter((v): v is T => set.has(v));
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

class CreateCandidateDto {
  /** Optional recruiter-supplied name override for the parsed CV name. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  /** Multipart form field — arrives as a string. */
  @IsOptional()
  @IsIn(['true', 'false'])
  consent?: string;
}

class ConsentDto {
  @IsBoolean()
  granted!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      "Create a candidate from an uploaded CV ('cv' file field; optional fullName override and consent flag)",
  })
  async create(
    @Body() dto: CreateCandidateDto,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("A CV file is required in the 'cv' field");

    const { candidate } = await this.candidatesService.createFromCvBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      userId: user.id,
      source: 'MANUAL',
      consent: dto.consent === 'true' ? true : undefined,
      fullNameOverride: dto.fullName,
    });

    return this.candidatesService.detail(candidate.id);
  }

  @Get()
  @ApiOperation({
    summary:
      'List candidates with segmentation filters: ?search= (name/title), repeatable ?skills= with ?skillMode=any|all, repeatable ?locations=/?sources=/?consent=/?stages=, ?minExperience=/?maxExperience=',
  })
  list(
    @Query('search') search?: string,
    @Query('skills') skills?: string | string[],
    @Query('skillMode') skillMode?: string,
    @Query('locations') locations?: string | string[],
    @Query('sources') sources?: string | string[],
    @Query('consent') consent?: string | string[],
    @Query('stages') stages?: string | string[],
    @Query('minExperience') minExperience?: string,
    @Query('maxExperience') maxExperience?: string,
  ) {
    return this.candidatesService.list({
      search,
      skills: toArray(skills),
      skillMode: skillMode === 'all' ? 'all' : 'any',
      locations: toArray(locations),
      sources: toEnumArray<CandidateSource>(sources, CANDIDATE_SOURCES),
      consentStatuses: toEnumArray<ConsentStatus>(consent, CONSENT_STATUSES),
      stages: toEnumArray<PipelineStage>(stages, PIPELINE_STAGES),
      minExperience: toNumber(minExperience),
      maxExperience: toNumber(maxExperience),
    });
  }

  @Get('facets')
  @ApiOperation({
    summary:
      'Filter options for the candidate list with counts: skills, locations, sources, consent statuses, pipeline stages, experience range',
  })
  facets() {
    return this.candidatesService.facets();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Candidate detail including CV documents with parsed CV JSON' })
  detail(@Param('id') id: string) {
    return this.candidatesService.detail(id);
  }

  @Post(':id/consent')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Record DPDP consent (granted or revoked) for a candidate' })
  consent(@Param('id') id: string, @Body() dto: ConsentDto, @CurrentUser() user: AuthUser) {
    return this.candidatesService.recordConsent(id, dto.granted, dto.note, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary: 'DPDP erasure: delete stored CV files and hard-delete the candidate (cascades)',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.candidatesService.erase(id, user);
  }

  @Get(':id/cv-documents/:docId/text')
  @ApiOperation({ summary: 'Raw parsed text of a CV document (for the analyzer view)' })
  cvText(@Param('id') id: string, @Param('docId') docId: string) {
    return this.candidatesService.getCvDocumentText(id, docId);
  }
}

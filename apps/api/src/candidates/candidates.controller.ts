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
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CandidatesService } from './candidates.service';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

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
  @ApiOperation({ summary: 'List candidates (non-deleted), optional ?search= on full name' })
  list(@Query('search') search?: string) {
    return this.candidatesService.list(search);
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

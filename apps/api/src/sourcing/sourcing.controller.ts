import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SourcingService } from './sourcing.service';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 100;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;

class BulkUploadDto {
  @IsString()
  @MinLength(1)
  jdId!: string;

  /** DPDP consent captured at upload time for all candidates in the batch. */
  @IsOptional()
  @IsIn(['true', 'false'])
  consent?: 'true' | 'false';
}

@ApiTags('sourcing')
@ApiBearerAuth()
@Controller('sourcing')
export class SourcingController {
  constructor(private readonly sourcingService: SourcingService) {}

  @Post('bulk-upload')
  @Roles('ADMIN', 'RECRUITER')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      "Bulk-upload CVs against a JD ('files' field, up to 100 .pdf/.docx/.txt) — returns the sourcing job to poll",
  })
  async bulkUpload(
    @Body() dto: BulkUploadDto,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("At least one CV file is required in the 'files' field");
    }

    const rejected = files
      .map((f) => f.originalname)
      .filter((name) => !ALLOWED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)));
    if (rejected.length > 0) {
      throw new BadRequestException(
        `Unsupported file type (allowed: ${ALLOWED_EXTENSIONS.join(', ')}): ${rejected.join(', ')}`,
      );
    }

    return this.sourcingService.startBulkJob({
      jdId: dto.jdId,
      files: files.map((f) => ({
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
      })),
      userId: user.id,
      consent: dto.consent === 'true',
    });
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Recent sourcing jobs for a JD (?jdId=), newest first' })
  listJobs(@Query('jdId') jdId?: string) {
    if (!jdId) throw new BadRequestException('jdId query parameter is required');
    return this.sourcingService.listJobs(jdId);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Sourcing job with item rows — poll this for bulk-upload progress' })
  getJob(@Param('id') id: string) {
    return this.sourcingService.getJob(id);
  }

  @Get('ranked')
  @ApiOperation({
    summary:
      'Ranked candidate list for a JD (?jdId=): latest analysis per candidate, best score first',
  })
  ranked(@Query('jdId') jdId?: string) {
    if (!jdId) throw new BadRequestException('jdId query parameter is required');
    return this.sourcingService.rankedForJd(jdId);
  }
}

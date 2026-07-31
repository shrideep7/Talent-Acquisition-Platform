import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ExportService } from './export.service';

@ApiTags('cv-versions')
@ApiBearerAuth()
@Controller('cv-versions')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':id/export')
  @Roles('ADMIN', 'RECRUITER')
  @ApiQuery({ name: 'format', enum: ['docx', 'pdf'] })
  @ApiOperation({
    summary: 'Download a CV version as DOCX or PDF (marks the version EXPORTED)',
  })
  async export(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    if (format !== 'docx' && format !== 'pdf') {
      throw new BadRequestException("Query parameter 'format' must be 'docx' or 'pdf'");
    }
    const file = await this.exportService.exportVersion(id, format, user);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Content-Length': String(file.buffer.length),
    });
    res.send(file.buffer);
  }
}

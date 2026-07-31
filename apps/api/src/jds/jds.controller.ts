import {
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
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { JdsService } from './jds.service';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

class CreateJdDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  rawText?: string;
}

@ApiTags('jds')
@ApiBearerAuth()
@Controller('jds')
export class JdsController {
  constructor(private readonly jdsService: JdsService) {}

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: "Create a JD from an uploaded 'file' (.pdf/.docx/.txt) or a 'rawText' field",
  })
  create(
    @Body() dto: CreateJdDto,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.jdsService.create(dto, user, file);
  }

  @Get()
  @ApiOperation({ summary: 'List JDs (newest first), optional ?search= on title' })
  list(@Query('search') search?: string) {
    return this.jdsService.list(search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single JD with parsed criteria' })
  get(@Param('id') id: string) {
    return this.jdsService.get(id);
  }

  @Post(':id/reparse')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Re-run AI criteria extraction for this JD (bypasses the LLM cache)' })
  reparse(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jdsService.reparse(id, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Soft-delete a JD' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.jdsService.softDelete(id, user);
  }
}

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PIPELINE_STAGES, type PipelineStage } from '@mfd/shared';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PipelineService } from './pipeline.service';

class UpdatePipelineEntryDto {
  @IsOptional()
  @IsIn(PIPELINE_STAGES as unknown as string[])
  stage?: PipelineStage;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreatePipelineEntryDto {
  @IsString()
  @MinLength(1)
  jdId!: string;

  @IsString()
  @MinLength(1)
  candidateId!: string;

  @IsOptional()
  @IsIn(PIPELINE_STAGES as unknown as string[])
  stage?: PipelineStage;
}

@ApiTags('pipeline')
@ApiBearerAuth()
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get('jd/:jdId')
  @ApiOperation({ summary: 'Pipeline entries for a JD with candidate details, best score first' })
  listForJd(@Param('jdId') jdId: string) {
    return this.pipelineService.listForJd(jdId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Update a pipeline entry stage and/or notes' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePipelineEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pipelineService.update(id, dto, user);
  }

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Add a candidate to a JD pipeline (upsert on jdId+candidateId)' })
  create(@Body() dto: CreatePipelineEntryDto, @CurrentUser() user: AuthUser) {
    return this.pipelineService.upsert(dto, user);
  }
}

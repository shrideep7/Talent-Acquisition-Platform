import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SkillsService } from './skills.service';
import type { SkillDecision } from './skills.service';

const SKILL_DECISIONS = ['ACCEPTED', 'REJECTED', 'VERIFIED'] as const;

class UpdateSkillStatusDto {
  @IsIn(SKILL_DECISIONS as unknown as string[])
  status!: SkillDecision;

  @IsOptional()
  @IsString()
  evidence?: string;
}

class ProposeMissingDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  jdId!: string;

  @IsString({ each: true })
  skills!: string[];
}

class CreateVerifiedSkillDto {
  @IsUUID()
  candidateId!: string;

  @IsOptional()
  @IsUUID()
  jdId?: string;

  @IsString()
  @MinLength(1)
  skill!: string;

  @IsString()
  @MinLength(1)
  evidence!: string;
}

@ApiTags('skills')
@ApiBearerAuth()
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'List verified-skill rows, filter by ?candidateId= and ?jdId=' })
  list(@Query('candidateId') candidateId?: string, @Query('jdId') jdId?: string) {
    return this.skillsService.list(candidateId, jdId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Accept/reject a proposed skill, or mark it VERIFIED (requires evidence from the genuineness interview)',
  })
  update(@Param('id') id: string, @Body() dto: UpdateSkillStatusDto, @CurrentUser() user: AuthUser) {
    return this.skillsService.updateStatus(id, dto.status, dto.evidence, user);
  }

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary: 'Directly record a skill verified in the genuineness interview (with evidence)',
  })
  create(@Body() dto: CreateVerifiedSkillDto, @CurrentUser() user: AuthUser) {
    return this.skillsService.create(dto, user);
  }

  @Post('propose-missing')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Queue missing JD skills as PROPOSED verification items — the recruiter checks each with the candidate; only VERIFIED skills (with evidence) enter regenerated CVs',
  })
  proposeMissing(@Body() dto: ProposeMissingDto, @CurrentUser() user: AuthUser) {
    return this.skillsService.proposeMissing(dto, user);
  }
}

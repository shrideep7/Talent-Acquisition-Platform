import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PrepService } from './prep.service';

class GeneratePrepDto {
  @IsUUID()
  jdId!: string;

  @IsUUID()
  candidateId!: string;
}

@ApiTags('interview-preps')
@ApiBearerAuth()
@Controller('interview-preps')
export class PrepController {
  constructor(private readonly prepService: PrepService) {}

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Generate an interview prep pack (likely questions, skill gaps, genuineness screening) for a JD + candidate',
  })
  generate(@Body() dto: GeneratePrepDto, @CurrentUser() user: AuthUser) {
    return this.prepService.generate(dto.jdId, dto.candidateId, user);
  }

  @Get()
  @ApiOperation({ summary: 'Interview prep history (latest first), filter by ?jdId= and ?candidateId=' })
  list(@Query('jdId') jdId?: string, @Query('candidateId') candidateId?: string) {
    return this.prepService.list(jdId, candidateId);
  }

  @Post('verification-checklist')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Generate (without persisting) a genuineness-interview checklist for the UNVERIFIED_POSSIBLE skills of the latest analysis',
  })
  verificationChecklist(@Body() dto: GeneratePrepDto) {
    return this.prepService.verificationChecklist(dto.jdId, dto.candidateId);
  }
}

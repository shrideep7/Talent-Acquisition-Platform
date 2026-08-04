import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { WhatsappScreeningService } from './whatsapp-screening.service';

class StartScreeningDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  jdId!: string;

  /** Override when the parsed CV has no phone; +91XXXXXXXXXX or bare 10 digits. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  phone?: string;
}

class SimulateReplyDto {
  @IsString()
  @MinLength(1)
  text!: string;
}

@ApiTags('whatsapp-screening')
@ApiBearerAuth()
@Controller('whatsapp-screening')
export class WhatsappScreeningController {
  constructor(private readonly service: WhatsappScreeningService) {}

  @Get('config')
  @ApiOperation({ summary: "Channel mode: 'meta' (real WhatsApp) or 'simulated' (in-app testing)" })
  config() {
    return { mode: this.service.mode };
  }

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary: 'Start a WhatsApp pre-screen for a candidate + JD (sends the invite message)',
  })
  start(@Body() dto: StartScreeningDto, @CurrentUser() user: AuthUser) {
    return this.service.start(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List pre-screen conversations, filter by ?candidateId= and ?jdId=' })
  list(@Query('candidateId') candidateId?: string, @Query('jdId') jdId?: string) {
    return this.service.list(candidateId, jdId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Conversation detail: transcript, answers, pre-call brief' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Cancel a running pre-screen conversation' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user);
  }

  @Post(':id/simulate-reply')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary: 'Simulator (simulated mode only): feed a candidate reply into the conversation',
  })
  simulateReply(@Param('id') id: string, @Body() dto: SimulateReplyDto) {
    return this.service.simulateReply(id, dto.text);
  }
}

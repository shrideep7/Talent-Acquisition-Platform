import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { EmailPrescreenService } from './email-prescreen.service';

class StartEmailPrescreenDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  jdId!: string;

  /** Override when the parsed CV has no email address. */
  @IsOptional()
  @IsEmail()
  email?: string;
}

class RecordReplyDto {
  @IsString()
  @MinLength(5)
  text!: string;
}

@ApiTags('email-prescreen')
@ApiBearerAuth()
@Controller('email-prescreen')
export class EmailPrescreenController {
  constructor(private readonly service: EmailPrescreenService) {}

  @Get('config')
  @ApiOperation({ summary: "Email channel mode: 'smtp' (SES) or 'simulated'" })
  config() {
    return { mode: this.service.mode };
  }

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Send a pre-screening email (response-form link + questions inline) to a candidate for a JD',
  })
  start(@Body() dto: StartEmailPrescreenDto, @CurrentUser() user: AuthUser) {
    return this.service.start(dto, user);
  }

  @Post(':id/record-reply')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      "Paste the candidate's email reply — parses it against the questions and completes the pre-screen",
  })
  recordReply(@Param('id') id: string, @Body() dto: RecordReplyDto, @CurrentUser() user: AuthUser) {
    return this.service.recordReply(id, dto.text, user);
  }
}

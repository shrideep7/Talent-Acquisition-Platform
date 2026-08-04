import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsBoolean, IsObject } from 'class-validator';
import { Public } from '../common/decorators';
import { EmailPrescreenService } from './email-prescreen.service';

class SubmitFormDto {
  @IsBoolean()
  consent!: boolean;

  /** stepKey → the candidate's answer text. */
  @IsObject()
  answers!: Record<string, string>;
}

/**
 * Candidate-facing endpoints behind an unguessable token from the
 * pre-screening email — no login. GET renders the form; POST submits it.
 */
@ApiExcludeController()
@Controller('prescreen-form')
export class PrescreenFormController {
  constructor(private readonly service: EmailPrescreenService) {}

  @Public()
  @Get(':token')
  getForm(@Param('token') token: string) {
    return this.service.getForm(token);
  }

  @Public()
  @Post(':token')
  submit(@Param('token') token: string, @Body() dto: SubmitFormDto) {
    return this.service.submitForm(token, dto);
  }
}

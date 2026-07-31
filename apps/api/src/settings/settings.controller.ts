import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsObject, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SettingsService } from './settings.service';

class ScoreWeightsDto {
  @IsNumber()
  @Min(0)
  skills!: number;

  @IsNumber()
  @Min(0)
  experience!: number;

  @IsNumber()
  @Min(0)
  keywords!: number;

  @IsNumber()
  @Min(0)
  education!: number;

  @IsNumber()
  @Min(0)
  atsHealth!: number;
}

class ProviderCredentialsDto {
  /** Provider-specific key/value credential fields (e.g. { username, password }). */
  @IsObject()
  credentials!: Record<string, string>;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('weights')
  @ApiOperation({ summary: 'Effective scoring weights (stored override or defaults)' })
  getWeights() {
    return this.settingsService.getWeights();
  }

  @Put('weights')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Set scoring weights (admin) — must be >= 0 and sum to 100' })
  updateWeights(@Body() dto: ScoreWeightsDto, @CurrentUser() user: AuthUser) {
    return this.settingsService.updateWeights(dto, user);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Configured sourcing providers (never returns credential payloads)' })
  listProviders() {
    return this.settingsService.listProviders();
  }

  @Put('providers/:provider')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Store encrypted sourcing credentials for a provider (admin)' })
  setProviderCredentials(
    @Param('provider') provider: string,
    @Body() dto: ProviderCredentialsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settingsService.setProviderCredentials(provider, dto.credentials, user);
  }
}

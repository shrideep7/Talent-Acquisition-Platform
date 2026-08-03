import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { NaukriService } from './naukri.service';

class ExtractNaukriSearchDto {
  @IsOptional()
  @IsUUID()
  jdId?: string;

  @IsOptional()
  @IsString()
  rawText?: string;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

@ApiTags('naukri-search')
@ApiBearerAuth()
@Controller('naukri-search')
export class NaukriController {
  constructor(private readonly naukriService: NaukriService) {}

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Extract Naukri Resdex search-filter values (boolean keywords, experience, locations, salary, …) from a saved JD or pasted JD text',
  })
  extract(@Body() dto: ExtractNaukriSearchDto, @CurrentUser() user: AuthUser) {
    return this.naukriService.extract(dto, user);
  }
}

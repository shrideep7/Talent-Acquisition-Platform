import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { VENDOR_STATUSES } from '@mfd/shared';
import type { VendorStatus } from '@mfd/shared';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { VendorsService } from './vendors.service';

class CreateVendorDto {
  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @MinLength(1)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(VENDOR_STATUSES as unknown as string[])
  status?: VendorStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(VENDOR_STATUSES as unknown as string[])
  status?: VendorStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class ShareJdDto {
  @IsUUID()
  jdId!: string;

  /** Omit to target every ACTIVE vendor. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  vendorIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  includeClientName?: boolean;

  @IsOptional()
  @IsBoolean()
  attachJdFile?: boolean;

  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('config')
  @ApiOperation({ summary: "Email channel mode used for JD blasts: 'smtp' or 'simulated'" })
  config() {
    return { mode: this.vendorsService.mailMode };
  }

  @Get()
  @ApiOperation({ summary: 'List vendors, optional ?search= (company/contact/specialization) and ?status=' })
  list(@Query('search') search?: string, @Query('status') status?: string) {
    const valid = (VENDOR_STATUSES as readonly string[]).includes(status ?? '');
    return this.vendorsService.list({
      search,
      status: valid ? (status as VendorStatus) : undefined,
    });
  }

  @Get('shares')
  @ApiOperation({ summary: 'JD share history, filter by ?jdId= and ?vendorId=' })
  listShares(@Query('jdId') jdId?: string, @Query('vendorId') vendorId?: string) {
    return this.vendorsService.listShares(jdId, vendorId);
  }

  @Post('share-jd')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({
    summary:
      'Email a JD to vendors (all ACTIVE by default) as personalized messages, optionally attaching the original document',
  })
  shareJd(@Body() dto: ShareJdDto, @CurrentUser() user: AuthUser) {
    return this.vendorsService.shareJd(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Vendor detail' })
  getOne(@Param('id') id: string) {
    return this.vendorsService.getOne(id);
  }

  @Post()
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Add a vendor (recruitment agency contact)' })
  create(@Body() dto: CreateVendorDto, @CurrentUser() user: AuthUser) {
    return this.vendorsService.create(dto, user);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Update a vendor' })
  update(@Param('id') id: string, @Body() dto: UpdateVendorDto, @CurrentUser() user: AuthUser) {
    return this.vendorsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RECRUITER')
  @ApiOperation({ summary: 'Remove a vendor (soft delete — share history is retained)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.vendorsService.remove(id, user);
  }
}

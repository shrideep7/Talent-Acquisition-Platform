import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '@mfd/shared';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(USER_ROLES as unknown as string[])
  role!: UserRole;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin)' })
  list() {
    return this.usersService.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a user (admin)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.create(dto, actor.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.update(id, dto, actor.id);
  }
}

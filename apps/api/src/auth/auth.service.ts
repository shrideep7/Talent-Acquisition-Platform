import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthResponseDto, UserDto } from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ipAddress?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.audit.log({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress,
    });

    return { accessToken, user: this.toDto(user) };
  }

  toDto(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserDto['role'],
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

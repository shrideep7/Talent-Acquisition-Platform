import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { UserDto, UserRole } from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from './auth.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => this.authService.toDto(u));
  }

  async create(
    input: { email: string; name: string; password: string; role: UserRole },
    actorId: string,
  ): Promise<UserDto> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 10),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      detail: { email: user.email, role: user.role },
    });
    return this.authService.toDto(user);
  }

  async update(
    id: string,
    input: { name?: string; role?: UserRole; isActive?: boolean; password?: string },
    actorId: string,
  ): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        role: input.role ?? undefined,
        isActive: input.isActive ?? undefined,
        passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      detail: { fields: Object.keys(input).filter((k) => k !== 'password') },
    });
    return this.authService.toDto(updated);
  }
}

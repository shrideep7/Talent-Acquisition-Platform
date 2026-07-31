import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AuditLogDto } from '@mfd/shared';
import { Roles } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  /** ISO-8601 lower bound (inclusive) on createdAt. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** ISO-8601 upper bound (inclusive) on createdAt. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-log')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated audit log with user email (admin)' })
  async list(@Query() query: AuditLogQueryDto): Promise<{ items: AuditLogDto[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const createdAt =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          }
        : undefined;

    const where = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items: AuditLogDto[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userEmail: log.user?.email ?? null,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      detail: log.detail ? (log.detail as unknown as Record<string, unknown>) : null,
      createdAt: log.createdAt.toISOString(),
    }));

    return { items, total };
  }
}

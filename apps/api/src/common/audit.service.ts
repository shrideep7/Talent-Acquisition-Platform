import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '@mfd/shared';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Append-only audit log: who generated/sent which CV version, who deleted
 * which candidate, etc. Failures are logged but never break the main flow.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          detail: (entry.detail as object) ?? undefined,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Audit log write failed: ${(err as Error).message}`);
    }
  }
}

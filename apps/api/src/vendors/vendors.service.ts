import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Vendor, JdShare } from '@prisma/client';
import type {
  JdShareDto,
  ParsedJd,
  ShareJdResultDto,
  VendorDto,
  VendorStatus,
} from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { MailService } from '../email/mail.service';
import { buildJdShareEmail } from './jd-share-email';

export interface UpsertVendorInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  status?: VendorStatus;
  specializations?: string[];
  notes?: string;
}

export interface ShareJdInput {
  jdId: string;
  /** Explicit vendor ids; when omitted, all ACTIVE vendors are targeted. */
  vendorIds?: string[];
  /** Restrict the "all active" target set to vendors carrying any of these specializations. */
  specializations?: string[];
  /** Recruiter note prepended to the requirement details. */
  note?: string;
  /** Reveal the end client to vendors. Off by default — they can go direct. */
  includeClientName?: boolean;
  /** Attach the original JD document when one was uploaded. */
  attachJdFile?: boolean;
  /** Send again to vendors who already received this JD. */
  resend?: boolean;
}

type VendorWithShares = Vendor & { jdShares?: { sentAt: Date }[] };

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  get mailMode() {
    return this.mail.mode;
  }

  // ------------------------------------------------------------------ CRUD

  async create(input: UpsertVendorInput, user: AuthUser): Promise<VendorDto> {
    const email = this.normalizeEmail(input.email);
    const emailHash = this.crypto.emailHash(email) as string;

    const existing = await this.prisma.vendor.findUnique({ where: { emailHash } });
    if (existing) {
      if (!existing.deletedAt) {
        throw new ConflictException(`A vendor with this email already exists (${existing.companyName})`);
      }
      // Re-activate a previously removed vendor rather than orphaning the row.
      const restored = await this.prisma.vendor.update({
        where: { id: existing.id },
        data: {
          ...this.writableFields(input),
          email: this.crypto.encrypt(email) as string,
          deletedAt: null,
        },
      });
      await this.logVendor('VENDOR_CREATED', restored, user, { restored: true });
      return this.toDto(restored);
    }

    const vendor = await this.prisma.vendor.create({
      data: {
        ...this.writableFields(input),
        email: this.crypto.encrypt(email) as string,
        emailHash,
        createdById: user.id,
      },
    });
    await this.logVendor('VENDOR_CREATED', vendor, user);
    return this.toDto(vendor);
  }

  async update(id: string, input: Partial<UpsertVendorInput>, user: AuthUser): Promise<VendorDto> {
    const vendor = await this.getEntity(id);

    const data: Record<string, unknown> = {};
    if (input.companyName !== undefined) data.companyName = input.companyName.trim();
    if (input.contactName !== undefined) data.contactName = input.contactName.trim();
    if (input.phone !== undefined) data.phone = this.crypto.encrypt(input.phone.trim() || null);
    if (input.status !== undefined) data.status = input.status;
    if (input.specializations !== undefined) {
      data.specializations = this.cleanSpecializations(input.specializations);
    }
    if (input.notes !== undefined) data.notes = input.notes.trim() || null;

    if (input.email !== undefined) {
      const email = this.normalizeEmail(input.email);
      const emailHash = this.crypto.emailHash(email) as string;
      if (emailHash !== vendor.emailHash) {
        const clash = await this.prisma.vendor.findUnique({ where: { emailHash } });
        if (clash && clash.id !== id && !clash.deletedAt) {
          throw new ConflictException(
            `Another vendor already uses this email (${clash.companyName})`,
          );
        }
        data.email = this.crypto.encrypt(email);
        data.emailHash = emailHash;
      }
    }

    const updated = await this.prisma.vendor.update({ where: { id }, data });
    await this.logVendor('VENDOR_UPDATED', updated, user, { fields: Object.keys(data) });
    return this.toDto(updated);
  }

  async list(opts: { search?: string; status?: VendorStatus } = {}): Promise<VendorDto[]> {
    const search = opts.search?.trim();
    const vendors = await this.prisma.vendor.findMany({
      where: {
        deletedAt: null,
        ...(opts.status ? { status: opts.status } : {}),
        ...(search
          ? {
              OR: [
                { companyName: { contains: search, mode: 'insensitive' as const } },
                { contactName: { contains: search, mode: 'insensitive' as const } },
                { specializations: { has: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { companyName: 'asc' }],
      include: { jdShares: { select: { sentAt: true }, orderBy: { sentAt: 'desc' } } },
    });
    return vendors.map((v) => this.toDto(v));
  }

  async getOne(id: string): Promise<VendorDto> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      include: { jdShares: { select: { sentAt: true }, orderBy: { sentAt: 'desc' } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.toDto(vendor);
  }

  /** Soft delete — the share history stays intact as a record of what was sent. */
  async remove(id: string, user: AuthUser): Promise<{ success: true }> {
    const vendor = await this.getEntity(id);
    await this.prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.logVendor('VENDOR_DELETED', vendor, user);
    return { success: true };
  }

  // ----------------------------------------------------------------- share

  async shareJd(input: ShareJdInput, user: AuthUser): Promise<ShareJdResultDto> {
    const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const targets = await this.resolveTargets(input);
    if (targets.length === 0) {
      throw new UnprocessableEntityException(
        'No matching vendors to share with — add vendors, or widen the selection',
      );
    }

    // Skip vendors who already got this JD unless a resend was requested.
    const skippedAlreadyShared: string[] = [];
    let recipients = targets;
    if (!input.resend) {
      const prior = await this.prisma.jdShare.findMany({
        where: { jdId: jd.id, status: 'SENT', vendorId: { in: targets.map((v) => v.id) } },
        select: { vendorId: true },
      });
      const already = new Set(prior.map((p) => p.vendorId));
      recipients = targets.filter((v) => !already.has(v.id));
      for (const v of targets) if (already.has(v.id)) skippedAlreadyShared.push(v.companyName);
    }
    if (recipients.length === 0) {
      return { sent: [], failed: [], skippedAlreadyShared };
    }

    const attachment = input.attachJdFile === false ? null : await this.loadJdAttachment(jd.fileKey, jd.fileName);
    const parsed = jd.parsedCriteria ? (jd.parsedCriteria as unknown as ParsedJd) : null;
    const replyTo =
      this.config.get<string>('MAIL_REPLY_TO')?.trim() ||
      this.config.get<string>('MAIL_FROM')?.trim() ||
      'hiring@metafordata.com';

    const sent: JdShareDto[] = [];
    const failed: JdShareDto[] = [];

    for (const vendor of recipients) {
      const email = this.crypto.decrypt(vendor.email);
      const composed = buildJdShareEmail({
        vendorContactName: vendor.contactName,
        vendorCompanyName: vendor.companyName,
        jdTitle: jd.title,
        clientName: input.includeClientName ? jd.clientName || null : null,
        parsed,
        rawText: jd.rawText,
        note: input.note?.trim() || null,
        replyTo,
        hasAttachment: attachment !== null,
      });

      let result: { ok: boolean; error?: string };
      if (!email) {
        result = { ok: false, error: 'Vendor email could not be decrypted' };
      } else {
        // One personalized email per vendor — never a shared CC/BCC blast,
        // which would leak the vendor list to competitors.
        result = await this.mail.send({
          to: email,
          subject: composed.subject,
          text: composed.text,
          html: composed.html,
          ...(attachment ? { attachments: [attachment] } : {}),
        });
      }

      const row = await this.prisma.jdShare.create({
        data: {
          jdId: jd.id,
          vendorId: vendor.id,
          status: result.ok ? 'SENT' : 'FAILED',
          subject: composed.subject,
          attached: attachment !== null,
          error: result.ok ? null : (result.error ?? 'Unknown send error'),
          sentById: user.id,
        },
      });
      const dto = this.toShareDto(row, vendor);
      (result.ok ? sent : failed).push(dto);
    }

    await this.audit.log({
      userId: user.id,
      action: 'JD_SHARED_WITH_VENDORS',
      entityType: 'jd',
      entityId: jd.id,
      detail: {
        jdTitle: jd.title,
        sent: sent.length,
        failed: failed.length,
        skipped: skippedAlreadyShared.length,
        attached: attachment !== null,
        clientNameShared: input.includeClientName === true,
        mailMode: this.mail.mode,
      },
    });

    return { sent, failed, skippedAlreadyShared };
  }

  /** Share history for a JD (who received it, when, with what outcome). */
  async listShares(jdId?: string, vendorId?: string): Promise<JdShareDto[]> {
    const rows = await this.prisma.jdShare.findMany({
      where: { ...(jdId ? { jdId } : {}), ...(vendorId ? { vendorId } : {}) },
      orderBy: { sentAt: 'desc' },
      include: { vendor: { select: { companyName: true, contactName: true } } },
    });
    return rows.map((r) =>
      this.toShareDto(r, {
        companyName: r.vendor.companyName,
        contactName: r.vendor.contactName,
      }),
    );
  }

  // --------------------------------------------------------------- helpers

  private async resolveTargets(input: ShareJdInput): Promise<Vendor[]> {
    if (input.vendorIds && input.vendorIds.length > 0) {
      const vendors = await this.prisma.vendor.findMany({
        where: { id: { in: input.vendorIds }, deletedAt: null },
      });
      const inactive = vendors.filter((v) => v.status !== 'ACTIVE').map((v) => v.companyName);
      if (inactive.length > 0) {
        throw new BadRequestException(
          `These vendors are inactive and cannot receive JDs: ${inactive.join(', ')}`,
        );
      }
      return vendors;
    }

    const specializations = this.cleanSpecializations(input.specializations ?? []);
    return this.prisma.vendor.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(specializations.length > 0 ? { specializations: { hasSome: specializations } } : {}),
      },
      orderBy: { companyName: 'asc' },
    });
  }

  private async loadJdAttachment(
    fileKey: string | null,
    fileName: string | null,
  ): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    if (!fileKey) return null;
    try {
      const content = await this.storage.get(fileKey);
      if (content.byteLength > MAX_ATTACHMENT_BYTES) {
        this.logger.warn(
          `JD file ${fileKey} is ${content.byteLength} bytes — too large to attach, sending inline text instead`,
        );
        return null;
      }
      return {
        filename: fileName ?? 'job-description',
        content,
        contentType: guessContentType(fileName),
      };
    } catch (err) {
      // Storage hiccup must not block the blast — the email falls back to
      // including the full JD text inline.
      this.logger.warn(`Could not load JD attachment ${fileKey}: ${(err as Error).message}`);
      return null;
    }
  }

  private writableFields(input: UpsertVendorInput) {
    return {
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      phone: this.crypto.encrypt(input.phone?.trim() || null),
      status: input.status ?? ('ACTIVE' as const),
      specializations: this.cleanSpecializations(input.specializations ?? []),
      notes: input.notes?.trim() || null,
    };
  }

  private normalizeEmail(raw: string): string {
    const email = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(`"${raw}" is not a valid email address`);
    }
    return email;
  }

  private cleanSpecializations(values: string[]): string[] {
    const seen = new Map<string, string>();
    for (const raw of values) {
      const value = raw.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    }
    return [...seen.values()];
  }

  private async getEntity(id: string): Promise<Vendor> {
    const vendor = await this.prisma.vendor.findFirst({ where: { id, deletedAt: null } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async logVendor(
    action: 'VENDOR_CREATED' | 'VENDOR_UPDATED' | 'VENDOR_DELETED',
    vendor: Vendor,
    user: AuthUser,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.log({
      userId: user.id,
      action,
      entityType: 'vendor',
      entityId: vendor.id,
      // Company/contact names only — never the vendor's email address.
      detail: { companyName: vendor.companyName, contactName: vendor.contactName, ...extra },
    });
  }

  private toDto(vendor: VendorWithShares): VendorDto {
    return {
      id: vendor.id,
      companyName: vendor.companyName,
      contactName: vendor.contactName,
      email: this.crypto.decrypt(vendor.email),
      phone: this.crypto.decrypt(vendor.phone),
      status: vendor.status,
      specializations: vendor.specializations,
      notes: vendor.notes,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
      ...(vendor.jdShares
        ? {
            sharesCount: vendor.jdShares.length,
            lastSharedAt: vendor.jdShares[0]?.sentAt.toISOString() ?? null,
          }
        : {}),
    };
  }

  private toShareDto(
    row: JdShare,
    vendor?: { companyName: string; contactName: string },
  ): JdShareDto {
    return {
      id: row.id,
      jdId: row.jdId,
      vendorId: row.vendorId,
      vendorCompanyName: vendor?.companyName,
      vendorContactName: vendor?.contactName,
      status: row.status,
      subject: row.subject,
      attached: row.attached,
      error: row.error,
      sentAt: row.sentAt.toISOString(),
    };
  }
}

function guessContentType(fileName: string | null): string {
  const lower = (fileName ?? '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Jd, User } from '@prisma/client';
import { ParsedJdSchema } from '@mfd/shared';
import type { JdDto, ParsedJd, UserDto } from '@mfd/shared';
import { LlmService } from '../ai/llm.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { DocumentParserService } from '../documents/document-parser.service';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream', // some clients send this for any binary upload
];

export interface CreateJdInput {
  title: string;
  clientName?: string;
  rawText?: string;
}

@Injectable()
export class JdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly llm: LlmService,
    private readonly documentParser: DocumentParserService,
  ) {}

  async create(input: CreateJdInput, user: AuthUser, file?: Express.Multer.File): Promise<JdDto> {
    let rawText: string;
    let fileKey: string | null = null;
    let fileName: string | null = null;

    if (file) {
      this.assertAllowedFile(file.originalname, file.mimetype);
      const parsed = await this.documentParser.parseBuffer(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      rawText = parsed.text;
      fileKey = await this.storage.put('jds', file.originalname, file.buffer, file.mimetype);
      fileName = file.originalname;
    } else if (input.rawText && input.rawText.trim().length > 0) {
      rawText = input.rawText;
    } else {
      throw new BadRequestException("Provide either an uploaded 'file' or a non-empty 'rawText' field");
    }

    if (!rawText.trim()) {
      throw new BadRequestException('No text could be extracted from the JD document');
    }

    const result = await this.llm.structured({
      promptName: 'jd-parse',
      schema: ParsedJdSchema,
      schemaVersion: 'v1',
      userContent: rawText,
    });

    const jd = await this.prisma.jd.create({
      data: {
        title: input.title,
        clientName: input.clientName ?? undefined,
        rawText,
        parsedCriteria: result.data as unknown as object,
        fileKey,
        fileName,
        createdById: user.id,
      },
      include: { createdBy: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'JD_UPLOADED',
      entityType: 'jd',
      entityId: jd.id,
      detail: { title: jd.title, fileName, source: file ? 'file' : 'rawText' },
    });

    return this.toDto(jd);
  }

  async list(search?: string): Promise<JdDto[]> {
    const jds = await this.prisma.jd.findMany({
      where: {
        deletedAt: null,
        ...(search && search.trim().length > 0
          ? { title: { contains: search.trim(), mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true },
    });
    return jds.map((jd) => this.toDto(jd));
  }

  async get(id: string): Promise<JdDto> {
    const jd = await this.getEntity(id);
    return this.toDto(jd);
  }

  async reparse(id: string, user: AuthUser): Promise<JdDto> {
    const jd = await this.getEntity(id);

    const result = await this.llm.structured({
      promptName: 'jd-parse',
      schema: ParsedJdSchema,
      schemaVersion: 'v1',
      userContent: jd.rawText,
      noCache: true,
    });

    const updated = await this.prisma.jd.update({
      where: { id },
      data: { parsedCriteria: result.data as unknown as object },
      include: { createdBy: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'JD_UPLOADED',
      entityType: 'jd',
      entityId: id,
      detail: { title: jd.title, reparse: true },
    });

    return this.toDto(updated);
  }

  async softDelete(id: string, user: AuthUser): Promise<{ success: true }> {
    const jd = await this.getEntity(id);

    await this.prisma.jd.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.log({
      userId: user.id,
      action: 'JD_DELETED',
      entityType: 'jd',
      entityId: id,
      detail: { title: jd.title },
    });

    return { success: true };
  }

  private async getEntity(id: string): Promise<Jd & { createdBy: User }> {
    const jd = await this.prisma.jd.findFirst({
      where: { id, deletedAt: null },
      include: { createdBy: true },
    });
    if (!jd) throw new NotFoundException('JD not found');
    return jd;
  }

  private assertAllowedFile(fileName: string, mimeType: string): void {
    const lower = fileName.toLowerCase();
    const extOk = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!extOk) {
      throw new BadRequestException(
        `Unsupported file type — allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
    if (!ALLOWED_MIMETYPES.includes(mimeType)) {
      throw new BadRequestException(`Unsupported mimetype: ${mimeType}`);
    }
  }

  private toDto(jd: Jd & { createdBy?: User }): JdDto {
    return {
      id: jd.id,
      title: jd.title,
      clientName: jd.clientName,
      rawText: jd.rawText,
      parsedCriteria: jd.parsedCriteria ? (jd.parsedCriteria as unknown as ParsedJd) : null,
      fileName: jd.fileName,
      createdById: jd.createdById,
      createdBy: jd.createdBy ? this.toUserDto(jd.createdBy) : undefined,
      createdAt: jd.createdAt.toISOString(),
      updatedAt: jd.updatedAt.toISOString(),
    };
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

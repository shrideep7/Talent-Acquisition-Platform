import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { existsSync } from 'fs';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import type { GeneratedCv } from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

/** Calibri sizes in half-points: 11pt body, 12pt headings, 16pt name. */
const SIZE_BODY = 22;
const SIZE_HEADING = 24;
const SIZE_NAME = 32;

export type ExportFormat = 'docx' | 'pdf';

export interface ExportedCvFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportVersion(versionId: string, format: ExportFormat, user: AuthUser): Promise<ExportedCvFile> {
    const version = await this.prisma.cvVersion.findUnique({
      where: { id: versionId },
      include: {
        candidate: { select: { fullName: true } },
        jd: { select: { title: true } },
      },
    });
    if (!version) throw new NotFoundException('CV version not found');

    const cv = version.content as unknown as GeneratedCv;
    const buffer = format === 'docx' ? await this.buildDocx(cv) : await this.buildPdf(cv);
    const fileName = `${this.safeFilePart(version.candidate.fullName)}_${this.safeFilePart(
      version.jd.title,
    )}_v${version.versionNumber}.${format}`;

    await this.prisma.cvVersion.update({
      where: { id: versionId },
      data: { status: 'EXPORTED' },
    });
    await this.audit.log({
      userId: user.id,
      action: 'CV_VERSION_EXPORTED',
      entityType: 'cv_version',
      entityId: versionId,
      detail: { format, fileName, versionNumber: version.versionNumber },
    });

    return { buffer, fileName, contentType: format === 'docx' ? DOCX_MIME : PDF_MIME };
  }

  // ------------------------------------------------------------------ DOCX

  private async buildDocx(cv: GeneratedCv): Promise<Buffer> {
    const children: Paragraph[] = [];

    children.push(
      new Paragraph({
        children: [new TextRun({ text: cv.fullName, bold: true, size: SIZE_NAME })],
        spacing: { after: 60 },
      }),
    );
    if (cv.headline && cv.headline.trim()) {
      children.push(
        new Paragraph({ children: [new TextRun(cv.headline.trim())], spacing: { after: 60 } }),
      );
    }
    const contact = this.contactLine(cv);
    if (contact) {
      children.push(new Paragraph({ children: [new TextRun(contact)], spacing: { after: 120 } }));
    }

    const heading = (text: string) =>
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: SIZE_HEADING })],
        spacing: { before: 240, after: 120 },
      });

    if (cv.summary.trim()) {
      children.push(heading('SUMMARY'));
      children.push(new Paragraph({ children: [new TextRun(cv.summary.trim())] }));
    }

    if (cv.skills.length > 0) {
      children.push(heading('SKILLS'));
      for (const group of cv.skills) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${group.category}: `, bold: true }),
              new TextRun(group.items.join(', ')),
            ],
            spacing: { after: 40 },
          }),
        );
      }
    }

    if (cv.experience.length > 0) {
      children.push(heading('EXPERIENCE'));
      for (const role of cv.experience) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${role.title} — ${role.employer}`, bold: true })],
            spacing: { before: 120, after: 20 },
          }),
        );
        const meta = this.roleMetaLine(role.startDate, role.endDate, role.location);
        if (meta) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: meta, italics: true })],
              spacing: { after: 40 },
            }),
          );
        }
        for (const bullet of role.bullets) {
          children.push(
            new Paragraph({
              children: [new TextRun(bullet)],
              bullet: { level: 0 },
              spacing: { after: 20 },
            }),
          );
        }
      }
    }

    if (cv.education.length > 0) {
      children.push(heading('EDUCATION'));
      for (const edu of cv.education) {
        children.push(
          new Paragraph({
            children: [new TextRun(this.joinParts([edu.degree, edu.institution, edu.year]))],
            spacing: { after: 40 },
          }),
        );
      }
    }

    if (cv.certifications.length > 0) {
      children.push(heading('CERTIFICATIONS'));
      for (const cert of cv.certifications) {
        children.push(
          new Paragraph({
            children: [new TextRun(this.joinParts([cert.name, cert.issuer, cert.year]))],
            spacing: { after: 40 },
          }),
        );
      }
    }

    if (cv.projects.length > 0) {
      children.push(heading('PROJECTS'));
      for (const project of cv.projects) {
        const tech = project.technologies.length > 0 ? ` (${project.technologies.join(', ')})` : '';
        const description = project.description ? `: ${project.description}` : '';
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: project.name, bold: true }),
              new TextRun(`${description}${tech}`),
            ],
            spacing: { after: 40 },
          }),
        );
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: SIZE_BODY } },
        },
      },
      sections: [{ children }],
    });
    return Packer.toBuffer(doc);
  }

  // ------------------------------------------------------------------- PDF

  private async buildPdf(cv: GeneratedCv): Promise<Buffer> {
    const html = this.renderHtml(cv);
    const executablePath = this.resolveChromiumPath();

    let browser: Browser;
    try {
      browser = await chromium.launch({ executablePath });
    } catch (err) {
      this.logger.error(`Chromium launch failed (${executablePath}): ${(err as Error).message}`);
      throw new ServiceUnavailableException('PDF export requires Chromium — set CHROMIUM_PATH');
    }
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private resolveChromiumPath(): string {
    const fromEnv = process.env.CHROMIUM_PATH;
    if (fromEnv && existsSync(fromEnv)) return fromEnv;
    const containerDefault = '/opt/pw-browsers/chromium';
    if (existsSync(containerDefault)) return containerDefault;
    try {
      const bundled = chromium.executablePath();
      if (bundled && existsSync(bundled)) return bundled;
    } catch {
      // playwright-core has no bundled browser — fall through
    }
    throw new ServiceUnavailableException('PDF export requires Chromium — set CHROMIUM_PATH');
  }

  private renderHtml(cv: GeneratedCv): string {
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const sections: string[] = [];

    sections.push(`<h1>${esc(cv.fullName)}</h1>`);
    if (cv.headline && cv.headline.trim()) sections.push(`<p class="headline">${esc(cv.headline.trim())}</p>`);
    const contact = this.contactLine(cv);
    if (contact) sections.push(`<p class="contact">${esc(contact)}</p>`);

    if (cv.summary.trim()) {
      sections.push(`<h2>SUMMARY</h2><p>${esc(cv.summary.trim())}</p>`);
    }

    if (cv.skills.length > 0) {
      const rows = cv.skills
        .map((g) => `<p class="skill"><strong>${esc(g.category)}:</strong> ${esc(g.items.join(', '))}</p>`)
        .join('');
      sections.push(`<h2>SKILLS</h2>${rows}`);
    }

    if (cv.experience.length > 0) {
      const rows = cv.experience
        .map((role) => {
          const meta = this.roleMetaLine(role.startDate, role.endDate, role.location);
          const bullets = role.bullets.map((b) => `<li>${esc(b)}</li>`).join('');
          return [
            `<p class="role"><strong>${esc(role.title)} — ${esc(role.employer)}</strong></p>`,
            meta ? `<p class="meta"><em>${esc(meta)}</em></p>` : '',
            bullets ? `<ul>${bullets}</ul>` : '',
          ].join('');
        })
        .join('');
      sections.push(`<h2>EXPERIENCE</h2>${rows}`);
    }

    if (cv.education.length > 0) {
      const rows = cv.education
        .map((e) => `<p>${esc(this.joinParts([e.degree, e.institution, e.year]))}</p>`)
        .join('');
      sections.push(`<h2>EDUCATION</h2>${rows}`);
    }

    if (cv.certifications.length > 0) {
      const rows = cv.certifications
        .map((c) => `<p>${esc(this.joinParts([c.name, c.issuer, c.year]))}</p>`)
        .join('');
      sections.push(`<h2>CERTIFICATIONS</h2>${rows}`);
    }

    if (cv.projects.length > 0) {
      const rows = cv.projects
        .map((p) => {
          const tech = p.technologies.length > 0 ? ` (${p.technologies.join(', ')})` : '';
          const description = p.description ? `: ${p.description}` : '';
          return `<p><strong>${esc(p.name)}</strong>${esc(`${description}${tech}`)}</p>`;
        })
        .join('');
      sections.push(`<h2>PROJECTS</h2>${rows}`);
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; line-height: 1.35; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  .headline { margin: 0 0 4px 0; }
  .contact { margin: 0 0 10px 0; color: #333; }
  h2 { font-size: 12pt; margin: 14px 0 6px 0; border-bottom: 1px solid #999; padding-bottom: 2px; }
  p { margin: 0 0 4px 0; }
  .role { margin-top: 8px; }
  .meta { color: #333; }
  ul { margin: 2px 0 6px 18px; padding: 0; }
  li { margin: 0 0 2px 0; }
</style>
</head>
<body>${sections.join('\n')}</body>
</html>`;
  }

  // --------------------------------------------------------------- helpers

  private contactLine(cv: GeneratedCv): string | null {
    const parts = [cv.contact.email, cv.contact.phone, cv.contact.location].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    return parts.length > 0 ? parts.join(' | ') : null;
  }

  private roleMetaLine(startDate: string | null, endDate: string | null, location: string | null): string {
    const dates = [startDate, endDate]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' – ');
    return [dates, location ?? ''].filter((v) => v.length > 0).join(' | ');
  }

  private joinParts(parts: Array<string | null>): string {
    return parts
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(', ');
  }

  private safeFilePart(value: string): string {
    const cleaned = value
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return cleaned || 'CV';
  }
}

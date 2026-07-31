import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import { recognize } from 'node-tesseract-ocr';
import { DocParseMeta, ParsedDocument } from './parse-meta';

type SourceFormat = DocParseMeta['sourceFormat'];

/** Extracted text is considered sparse below this many characters (per whole PDF). */
const SPARSE_TEXT_THRESHOLD = 200;
/** Lines at or under this length (trimmed) are heading candidates. */
const MAX_HEADING_LINE_LENGTH = 48;
/** Line length under which a PDF line counts as "short" for the multi-column heuristic. */
const SHORT_LINE_LENGTH = 45;
/** Minimum line count before the multi-column heuristic is meaningful. */
const MIN_LINES_FOR_COLUMN_HEURISTIC = 30;

/** Common CV section headings, matched case-insensitively against short lines. */
const HEADING_KEYWORDS = new Set<string>([
  'summary',
  'professional summary',
  'executive summary',
  'career summary',
  'objective',
  'career objective',
  'profile',
  'professional profile',
  'about',
  'about me',
  'skills',
  'technical skills',
  'key skills',
  'core competencies',
  'competencies',
  'skills and abilities',
  'experience',
  'work experience',
  'professional experience',
  'employment',
  'employment history',
  'work history',
  'career history',
  'internships',
  'education',
  'educational qualifications',
  'academic background',
  'academics',
  'qualifications',
  'certifications',
  'certificates',
  'certifications and training',
  'training',
  'trainings',
  'courses',
  'projects',
  'key projects',
  'academic projects',
  'personal projects',
  'achievements',
  'accomplishments',
  'awards',
  'awards and achievements',
  'honors',
  'languages',
  'languages known',
  'personal details',
  'personal information',
  'personal profile',
  'contact',
  'contact information',
  'contact details',
  'references',
  'interests',
  'hobbies',
  'publications',
  'volunteer experience',
  'extracurricular activities',
  'strengths',
  'declaration',
]);

/** Named date-format detectors. Lookarounds keep e.g. "01/2021" from also firing inside "01/01/2021". */
const DATE_FORMAT_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  {
    name: 'MMMM YYYY',
    regex:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
  },
  {
    name: 'MMM YYYY',
    regex: /\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{4}\b/i,
  },
  {
    name: 'MM/YYYY',
    regex: /(?<![\d/])(0?[1-9]|1[0-2])\/(19|20)\d{2}(?![\d/])/,
  },
  {
    name: 'YYYY-MM',
    regex: /(?<![\d-])(19|20)\d{2}-(0[1-9]|1[0-2])(?![\d-])/,
  },
  {
    name: 'DD/MM/YYYY',
    regex: /(?<![\d/])(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(19|20)\d{2}(?![\d/])/,
  },
  {
    name: 'DD-MM-YYYY',
    regex: /(?<![\d-])(0?[1-9]|[12]\d|3[01])-(0?[1-9]|1[0-2])-(19|20)\d{2}(?![\d-])/,
  },
];

/**
 * Allowed (non-decorative) characters: printable ASCII, common whitespace and
 * common unicode punctuation (dashes, curly quotes, ellipsis, NBSP).
 * Bullets, box-drawing and other symbols intentionally count as decorative —
 * they are ATS red flags per the DocParseMeta contract.
 */
const NON_DECORATIVE_CHAR = /[\x20-\x7e\t\r\n\u00a0\u2010-\u2015\u2018\u2019\u201c\u201d\u2026]/;

/**
 * Extracts plain text + ATS format signals (DocParseMeta) from uploaded
 * CV/JD documents. Pure parsing — no persistence, no auth concerns.
 */
@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  /**
   * Parse a PDF/DOCX/TXT buffer into text + format metadata.
   * Throws BadRequestException for unsupported types or when no text at all
   * could be extracted; never crashes on malformed files.
   */
  async parseBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<ParsedDocument & { ocrUsed: boolean }> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException(`File "${fileName}" is empty.`);
    }

    const format = this.detectFormat(fileName, mimeType);
    let parsed: ParsedDocument;
    switch (format) {
      case 'pdf':
        parsed = await this.parsePdf(buffer, fileName);
        break;
      case 'docx':
        parsed = await this.parseDocx(buffer, fileName);
        break;
      case 'txt':
        parsed = this.parseTxt(buffer, fileName);
        break;
    }

    if (parsed.text.trim().length === 0) {
      throw new BadRequestException(
        `No text could be extracted from "${fileName}". The file may be empty, corrupted or an image-only scan.`,
      );
    }

    return { ...parsed, ocrUsed: parsed.meta.ocrUsed };
  }

  // ---------------------------------------------------------------- formats

  private detectFormat(fileName: string, mimeType: string): SourceFormat {
    const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? '';
    const mime = (mimeType ?? '').toLowerCase();
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (
      ext === 'docx' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'docx';
    }
    if (ext === 'txt' || mime === 'text/plain') return 'txt';
    throw new BadRequestException(
      `Unsupported file type "${fileName}" (${mimeType || 'unknown mime type'}). Supported formats: .pdf, .docx, .txt`,
    );
  }

  private async parsePdf(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    let text = '';
    let pageCount: number | null = null;
    try {
      const result = await pdf(buffer);
      text = result.text ?? '';
      pageCount = Number.isFinite(result.numpages) ? result.numpages : null;
    } catch (err) {
      this.logger.warn(`pdf-parse failed for "${fileName}": ${(err as Error).message}`);
      throw new BadRequestException(
        `No text could be extracted from "${fileName}": the PDF appears to be corrupted or unreadable.`,
      );
    }

    // Sparse text on a real page usually means a scanned/image-only PDF.
    // Proper OCR of a scanned PDF needs rasterization we do not ship
    // in-process; we only attempt the tesseract CLI (if installed) on a temp
    // copy of the file, and fall back gracefully to the sparse text.
    let ocrUsed = false;
    if (
      text.trim().length < SPARSE_TEXT_THRESHOLD &&
      (pageCount ?? 0) >= 1 &&
      process.env.OCR_ENABLED === 'true'
    ) {
      const ocrText = await this.tryOcr(buffer, fileName);
      if (ocrText !== null && ocrText.trim().length > text.trim().length) {
        text = ocrText;
        ocrUsed = true;
      }
      // On OCR failure we keep the sparse text: the resulting tiny charCount
      // and decorativeGlyphRatio computed below let the ATS checks flag it.
    }

    return {
      text,
      meta: this.buildMeta(text, {
        sourceFormat: 'pdf',
        pageCount,
        ocrUsed,
        tableCount: null, // unknown for PDFs
        imageCount: null, // unknown for PDFs
        headerFooterText: null,
        multiColumnSuspicion: this.multiColumnSuspicion(text, pageCount),
      }),
    };
  }

  private async parseDocx(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
    let text = '';
    let tableCount: number | null = null;
    let imageCount: number | null = null;
    try {
      const rawResult = await mammoth.extractRawText({ buffer });
      text = rawResult.value ?? '';
    } catch (err) {
      this.logger.warn(`mammoth.extractRawText failed for "${fileName}": ${(err as Error).message}`);
      throw new BadRequestException(
        `No text could be extracted from "${fileName}": the DOCX file appears to be corrupted or unreadable.`,
      );
    }
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer });
      const html = htmlResult.value ?? '';
      tableCount = (html.match(/<table[\s>]/gi) ?? []).length;
      imageCount = (html.match(/<img[\s>/]/gi) ?? []).length;
    } catch (err) {
      // Text extraction already succeeded — keep going with unknown counts.
      this.logger.warn(`mammoth.convertToHtml failed for "${fileName}": ${(err as Error).message}`);
    }

    return {
      text,
      meta: this.buildMeta(text, {
        sourceFormat: 'docx',
        pageCount: null, // DOCX has no fixed pagination before rendering
        ocrUsed: false,
        tableCount,
        imageCount,
        // NOTE: mammoth cannot read DOCX headers/footers, so any contact
        // details placed there are invisible to us (and to many ATSes).
        headerFooterText: null,
        // mammoth does not expose section/column settings; assume single-column.
        multiColumnSuspicion: 0,
      }),
    };
  }

  private parseTxt(buffer: Buffer, _fileName: string): ParsedDocument {
    const text = buffer.toString('utf8').replace(/^\ufeff/, '');
    return {
      text,
      meta: this.buildMeta(text, {
        sourceFormat: 'txt',
        pageCount: null,
        ocrUsed: false,
        tableCount: 0, // plain text cannot contain tables or images
        imageCount: 0,
        headerFooterText: null,
        multiColumnSuspicion: 0,
      }),
    };
  }

  // -------------------------------------------------------------------- ocr

  /**
   * Best-effort OCR via the tesseract CLI (node-tesseract-ocr shells out to
   * it). Writes the buffer to a temp file and asks tesseract to read it.
   * Returns null on any failure — missing binary, unreadable input, etc.
   */
  private async tryOcr(buffer: Buffer, fileName: string): Promise<string | null> {
    const tmpPath = join(tmpdir(), `mfd-ocr-${randomUUID()}.pdf`);
    try {
      await writeFile(tmpPath, buffer);
      const text = await recognize(tmpPath, { lang: 'eng', oem: 1, psm: 3 });
      return typeof text === 'string' && text.trim().length > 0 ? text : null;
    } catch (err) {
      this.logger.warn(`OCR fallback failed for "${fileName}": ${(err as Error).message}`);
      return null;
    } finally {
      await rm(tmpPath, { force: true }).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------- meta

  private buildMeta(
    text: string,
    base: Omit<DocParseMeta, 'detectedHeadings' | 'dateFormats' | 'charCount' | 'decorativeGlyphRatio'>,
  ): DocParseMeta {
    return {
      ...base,
      detectedHeadings: this.detectHeadings(text),
      dateFormats: this.detectDateFormats(text),
      charCount: text.length,
      decorativeGlyphRatio: this.decorativeGlyphRatio(text),
    };
  }

  /** Short lines matching common CV section names, in document order (deduped). */
  private detectHeadings(text: string): string[] {
    const headings: string[] = [];
    const seen = new Set<string>();
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.length > MAX_HEADING_LINE_LENGTH) continue;
      // Strip surrounding decoration (bullets, dashes, colons, pipes, ...).
      const cleaned = line.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z)]+$/, '');
      if (cleaned.length === 0) continue;
      const normalized = cleaned
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/\s+/g, ' ')
        .trim();
      if (HEADING_KEYWORDS.has(normalized) && !seen.has(normalized)) {
        seen.add(normalized);
        headings.push(cleaned);
      }
    }
    return headings;
  }

  /** Distinct date-format names found anywhere in the text. */
  private detectDateFormats(text: string): string[] {
    return DATE_FORMAT_PATTERNS.filter(({ regex }) => regex.test(text)).map(({ name }) => name);
  }

  /**
   * PDF multi-column heuristic: fraction of adjacent non-empty line pairs
   * where both lines are short. Column extraction interleaves the columns,
   * producing runs of short lines. 0 when the document is too small to judge.
   */
  private multiColumnSuspicion(text: string, pageCount: number | null): number {
    const lines = text.split(/\r?\n/);
    if ((pageCount ?? 0) < 1 || lines.length <= MIN_LINES_FOR_COLUMN_HEURISTIC) return 0;
    let pairs = 0;
    let shortPairs = 0;
    for (let i = 0; i < lines.length - 1; i += 1) {
      const a = lines[i].trim();
      const b = lines[i + 1].trim();
      if (a.length === 0 || b.length === 0) continue;
      pairs += 1;
      if (a.length < SHORT_LINE_LENGTH && b.length < SHORT_LINE_LENGTH) shortPairs += 1;
    }
    if (pairs === 0) return 0;
    return this.round(Math.min(1, shortPairs / pairs), 2);
  }

  /** Ratio of chars outside printable ASCII + common unicode punctuation. */
  private decorativeGlyphRatio(text: string): number {
    if (text.length === 0) return 0;
    let total = 0;
    let decorative = 0;
    for (const ch of text) {
      total += 1;
      if (!NON_DECORATIVE_CHAR.test(ch)) decorative += 1;
    }
    return total === 0 ? 0 : this.round(decorative / total, 4);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}

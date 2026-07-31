import { Injectable } from '@nestjs/common';
import type { AtsCheck, AtsHealth } from '@mfd/shared';
import type { DocParseMeta } from '../documents/parse-meta';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /\+?\d[\d\s\-().]{7,}\d/;

const MIN_CHARS = 1200;
const MAX_CHARS = 15000;
const MULTI_COLUMN_THRESHOLD = 0.45;
const DECORATIVE_GLYPH_THRESHOLD = 0.08;

const SEVERITY_PENALTY: Record<AtsCheck['severity'], number> = {
  critical: 25,
  warning: 10,
  info: 5,
};

const GENERATED_DETAIL = 'Generated single-column layout';

/** The four standard heading groups an ATS-friendly CV should carry (>= 3 required). */
const HEADING_GROUPS: { label: string; pattern: RegExp }[] = [
  { label: 'summary/profile/objective', pattern: /summary|profile|objective/i },
  { label: 'skills', pattern: /skills/i },
  { label: 'experience/employment', pattern: /experience|employment/i },
  { label: 'education', pattern: /education/i },
];

/**
 * Deterministic, rule-based ATS format health checks. Operates on the format
 * signals collected at parse time (DocParseMeta) plus the plain CV text.
 * `meta === null` means a generated CV version — structurally clean by
 * construction, so structural checks pass and only content checks run.
 */
@Injectable()
export class AtsChecksService {
  check(meta: DocParseMeta | null, cvText: string): AtsHealth {
    const checks: AtsCheck[] = [];

    // --- file_format (info) / scanned_document (critical) ------------------
    if (meta === null) {
      checks.push(this.mk('file_format', 'ATS-friendly file format', 'info', true, GENERATED_DETAIL));
    } else if (meta.ocrUsed) {
      checks.push(
        this.mk(
          'scanned_document',
          'Not a scanned document',
          'critical',
          false,
          'OCR was required to extract text — the document appears to be scanned images, which most ATS parsers cannot read',
        ),
      );
    } else {
      checks.push(
        this.mk(
          'file_format',
          'ATS-friendly file format',
          'info',
          true,
          `${meta.sourceFormat.toUpperCase()} source extracted cleanly without OCR`,
        ),
      );
    }

    // --- single_column (critical) ------------------------------------------
    if (meta === null) {
      checks.push(this.mk('single_column', 'Single-column layout', 'critical', true, GENERATED_DETAIL));
    } else {
      const passed = meta.multiColumnSuspicion <= MULTI_COLUMN_THRESHOLD;
      checks.push(
        this.mk(
          'single_column',
          'Single-column layout',
          'critical',
          passed,
          passed
            ? 'No multi-column layout detected'
            : `Multi-column layout suspected (suspicion ${meta.multiColumnSuspicion.toFixed(2)}) — columns scramble text order in ATS parsers`,
        ),
      );
    }

    // --- no_tables (critical) ----------------------------------------------
    if (meta === null) {
      checks.push(this.mk('no_tables', 'No tables', 'critical', true, GENERATED_DETAIL));
    } else {
      const tableCount = meta.tableCount ?? 0;
      checks.push(
        this.mk(
          'no_tables',
          'No tables',
          'critical',
          tableCount === 0,
          tableCount === 0
            ? 'No tables found'
            : `${tableCount} table(s) found — table cells are read out of order by many ATS parsers`,
        ),
      );
    }

    // --- no_images (warning) -------------------------------------------------
    if (meta === null) {
      checks.push(this.mk('no_images', 'No images', 'warning', true, GENERATED_DETAIL));
    } else {
      const imageCount = meta.imageCount ?? 0;
      checks.push(
        this.mk(
          'no_images',
          'No images',
          'warning',
          imageCount === 0,
          imageCount === 0
            ? 'No embedded images found'
            : `${imageCount} embedded image(s) found — images are invisible to ATS parsers`,
        ),
      );
    }

    // --- no_header_footer_content (warning) ----------------------------------
    if (meta === null) {
      checks.push(
        this.mk('no_header_footer_content', 'No content in headers/footers', 'warning', true, GENERATED_DETAIL),
      );
    } else {
      const headerFooter = (meta.headerFooterText ?? '').trim();
      checks.push(
        this.mk(
          'no_header_footer_content',
          'No content in headers/footers',
          'warning',
          headerFooter.length === 0,
          headerFooter.length === 0
            ? 'Headers and footers are empty'
            : 'Content found in headers/footers — many ATS parsers skip these regions entirely',
        ),
      );
    }

    // --- standard_headings (warning) ------------------------------------------
    if (meta === null) {
      checks.push(this.mk('standard_headings', 'Standard section headings', 'warning', true, GENERATED_DETAIL));
    } else {
      const found = HEADING_GROUPS.filter((group) =>
        meta.detectedHeadings.some((h) => group.pattern.test(h)),
      );
      const passed = found.length >= 3;
      checks.push(
        this.mk(
          'standard_headings',
          'Standard section headings',
          'warning',
          passed,
          passed
            ? `Found standard headings: ${found.map((g) => g.label).join(', ')}`
            : `Only ${found.length} of 4 standard heading groups detected (${
                found.map((g) => g.label).join(', ') || 'none'
              }) — need at least 3 of summary/profile, skills, experience, education`,
        ),
      );
    }

    // --- consistent_dates (warning) --------------------------------------------
    const dateFormats = meta === null ? this.scanDateFormats(cvText) : meta.dateFormats;
    if (dateFormats.length <= 1) {
      checks.push(
        this.mk(
          'consistent_dates',
          'Consistent date formats',
          'warning',
          true,
          dateFormats.length === 1 ? `Single date format used (${dateFormats[0]})` : 'No dates detected',
        ),
      );
    } else {
      checks.push(
        this.mk(
          'consistent_dates',
          'Consistent date formats',
          'warning',
          false,
          dateFormats.length === 2
            ? `Two date formats mixed (${dateFormats.join(', ')}) — pick one format throughout`
            : `${dateFormats.length} different date formats mixed (${dateFormats.join(', ')})`,
        ),
      );
    }

    // --- contact_info (critical) -------------------------------------------------
    const hasEmail = EMAIL_RE.test(cvText);
    const hasPhone = PHONE_RE.test(cvText);
    checks.push(
      this.mk(
        'contact_info',
        'Contact information present',
        'critical',
        hasEmail && hasPhone,
        hasEmail && hasPhone
          ? 'Email address and phone number found in the CV body'
          : `Missing ${[!hasEmail ? 'email address' : null, !hasPhone ? 'phone number' : null]
              .filter((x): x is string => x !== null)
              .join(' and ')} in the CV body text`,
      ),
    );

    // --- reasonable_length (info) --------------------------------------------------
    const charCount = meta === null ? cvText.length : meta.charCount;
    const lengthOk = charCount >= MIN_CHARS && charCount <= MAX_CHARS;
    checks.push(
      this.mk(
        'reasonable_length',
        'Reasonable length',
        'info',
        lengthOk,
        lengthOk
          ? `${charCount} characters — within the ${MIN_CHARS}-${MAX_CHARS} range`
          : charCount < MIN_CHARS
            ? `${charCount} characters — too short (minimum ${MIN_CHARS})`
            : `${charCount} characters — too long (maximum ${MAX_CHARS})`,
      ),
    );

    // --- parseable_text (critical) ----------------------------------------------------
    const glyphRatio = meta === null ? this.decorativeGlyphRatio(cvText) : meta.decorativeGlyphRatio;
    const parseable = glyphRatio < DECORATIVE_GLYPH_THRESHOLD;
    checks.push(
      this.mk(
        'parseable_text',
        'Text parses cleanly',
        'critical',
        parseable,
        parseable
          ? 'Decorative/non-standard glyph ratio is low'
          : `${(glyphRatio * 100).toFixed(1)}% of characters are decorative/non-standard glyphs — text likely garbles in ATS parsers`,
      ),
    );

    // --- score ------------------------------------------------------------------------
    let score = 100;
    for (const check of checks) {
      if (!check.passed) score -= SEVERITY_PENALTY[check.severity];
    }
    score = Math.max(0, Math.min(100, score));

    return { score, checks };
  }

  private mk(
    id: string,
    label: string,
    severity: AtsCheck['severity'],
    passed: boolean,
    detail: string,
  ): AtsCheck {
    return { id, label, severity, passed, detail };
  }

  /** Distinct date-format styles present in plain text (generated-CV path). */
  private scanDateFormats(text: string): string[] {
    const formats = new Set<string>();
    if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{4}\b/i.test(text)) {
      formats.add('MMM YYYY');
    }
    if (
      /\b(January|February|March|April|June|July|August|September|October|November|December)\s+\d{4}\b/i.test(
        text,
      )
    ) {
      formats.add('Month YYYY');
    }
    if (/\b\d{1,2}\/\d{4}\b/.test(text)) formats.add('MM/YYYY');
    if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) formats.add('DD/MM/YYYY');
    if (/\b\d{4}-\d{2}(-\d{2})?\b/.test(text)) formats.add('YYYY-MM');
    return [...formats];
  }

  /** Ratio of non-ASCII/decorative glyphs to total characters (whitespace excluded from the numerator). */
  private decorativeGlyphRatio(text: string): number {
    const chars = [...text];
    if (chars.length === 0) return 0;
    let decorative = 0;
    for (const ch of chars) {
      const code = ch.codePointAt(0) ?? 0;
      if (code > 0x7e && !/\s/.test(ch)) decorative++;
    }
    return decorative / chars.length;
  }
}

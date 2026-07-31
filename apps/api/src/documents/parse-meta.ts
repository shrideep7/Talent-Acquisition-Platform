/**
 * Format signals extracted while parsing a source document. Consumed by the
 * ATS health checker in the analyses module. CONTRACT FILE — coordinate any
 * change with both the documents and analyses modules.
 */
export interface DocParseMeta {
  /** 'pdf' | 'docx' | 'txt' */
  sourceFormat: 'pdf' | 'docx' | 'txt';
  pageCount: number | null;
  /** True when OCR was used (scanned PDF) — a strong ATS red flag. */
  ocrUsed: boolean;
  /** DOCX: number of <table> elements found. PDF: heuristic, null if unknown. */
  tableCount: number | null;
  /** DOCX: number of embedded images. PDF: heuristic, null if unknown. */
  imageCount: number | null;
  /** DOCX only: content found in headers/footers. */
  headerFooterText: string | null;
  /**
   * Multi-column layout suspicion, 0-1. PDFs: derived from text-flow
   * heuristics (many short interleaved lines). DOCX: from section settings
   * when detectable. 0 when confidently single-column.
   */
  multiColumnSuspicion: number;
  /** Detected top-level section headings, in document order. */
  detectedHeadings: string[];
  /** Distinct date formats found, e.g. ["MMM YYYY", "MM/YYYY"]. */
  dateFormats: string[];
  /** Total extracted character count. */
  charCount: number;
  /** Ratio of non-ASCII/decorative glyphs (bullets, box-drawing) to total chars. */
  decorativeGlyphRatio: number;
}

export interface ParsedDocument {
  text: string;
  meta: DocParseMeta;
}

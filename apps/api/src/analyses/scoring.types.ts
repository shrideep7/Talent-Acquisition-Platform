import type { MatchBreakdown, ParsedCv, ParsedJd } from '@mfd/shared';
import type { DocParseMeta } from '../documents/parse-meta';

/**
 * CONTRACT FILE — the ScoringService in this module implements exactly this
 * interface; the cv-versions and sourcing modules depend on it.
 */
export interface ScoreCvInput {
  jd: { id: string; rawText: string; parsedCriteria: ParsedJd };
  parsedCv: ParsedCv;
  /** Plain-text rendering of the CV used for exact keyword matching. */
  cvText: string;
  /**
   * Format signals from the original document. Pass null for generated CV
   * versions — they are structurally ATS-clean by construction and get a
   * structural check pass instead.
   */
  formatSignals: DocParseMeta | null;
  candidateId: string;
  /** Acting user (for audit + createdBy). */
  userId: string;
  cvDocumentId?: string;
  cvVersionId?: string;
  /** When false, compute the breakdown without persisting a MatchAnalysis row. */
  persist?: boolean;
}

export interface ScoreCvResult {
  /** Null when persist === false. */
  analysisId: string | null;
  totalScore: number;
  breakdown: MatchBreakdown;
}

export interface IScoringService {
  scoreCv(input: ScoreCvInput): Promise<ScoreCvResult>;
}

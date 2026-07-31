import type { ParsedJd } from '@mfd/shared';

/**
 * A candidate profile returned by an external sourcing provider (Phase 3).
 * When a provider can download the candidate's CV, it ships the raw file so
 * the profile can flow through the standard CV-ingestion pipeline
 * (CandidatesService.createFromCvBuffer).
 */
export interface SourcedProfile {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  noticePeriod?: string;
  totalYearsExperience?: number;
  /** Raw CV file bytes, when the provider exposes CV download. */
  cvBuffer?: Buffer;
  cvFileName?: string;
  /** Provider-specific payload kept verbatim for debugging/re-processing. */
  raw?: unknown;
}

/**
 * CONTRACT — every candidate-sourcing integration (Naukri Resdex, LinkedIn,
 * internal DB, ...) implements this interface so the sourcing service can
 * treat providers interchangeably.
 */
export interface SourcingProvider {
  /** Stable machine key, e.g. 'naukri_resdex'. Matches SourcingCredential.provider. */
  readonly key: string;
  /** Human-readable name for UI display, e.g. 'Naukri Resdex'. */
  readonly displayName: string;
  /** Whether credentials/config for this provider are present. */
  isConfigured(): Promise<boolean>;
  /** Search the provider for profiles matching the parsed JD criteria. */
  search(criteria: ParsedJd, options: { limit?: number }): Promise<SourcedProfile[]>;
}

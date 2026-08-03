export const USER_ROLES = ['ADMIN', 'RECRUITER', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PIPELINE_STAGES = [
  'SOURCED',
  'CONTACTED',
  'INTERESTED',
  'INTERNAL_INTERVIEW_DONE',
  'SENT_TO_CLIENT',
  'REJECTED',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const CANDIDATE_SOURCES = ['MANUAL', 'BULK_UPLOAD', 'NAUKRI'] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const CONSENT_STATUSES = ['PENDING', 'GRANTED', 'REVOKED'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CV_VERSION_STATUSES = ['DRAFT', 'EDITED', 'EXPORTED'] as const;
export type CvVersionStatus = (typeof CV_VERSION_STATUSES)[number];

/**
 * Skill match tiers — the integrity model of the CV generator.
 *
 * EXPLICIT             skill named in the CV (possibly verbatim)
 * TERMINOLOGY          skill present in the CV under different wording; the
 *                      generator may mirror the JD's exact term (Tier 1)
 * INFERRED             skill strongly implied by CV evidence; auto-promoted
 *                      but flagged for HR accept/reject (Tier 2)
 * UNVERIFIED_POSSIBLE  plausible given the profile but not evidenced; goes to
 *                      the genuineness-interview verification checklist and
 *                      only enters the CV after a recruiter marks it VERIFIED
 *                      with evidence from the candidate (Tier 3)
 * ABSENT               not present and not plausible; never enters the CV —
 *                      feeds the skill-gap briefing instead (Tier 4)
 */
export const SKILL_MATCH_TIERS = [
  'EXPLICIT',
  'TERMINOLOGY',
  'INFERRED',
  'UNVERIFIED_POSSIBLE',
  'ABSENT',
] as const;
export type SkillMatchTier = (typeof SKILL_MATCH_TIERS)[number];

export const VERIFIED_SKILL_STATUSES = [
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'VERIFIED',
] as const;
export type VerifiedSkillStatus = (typeof VERIFIED_SKILL_STATUSES)[number];

export const SOURCING_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const;
export type SourcingJobStatus = (typeof SOURCING_JOB_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'USER_LOGIN',
  'USER_CREATED',
  'USER_UPDATED',
  'JD_UPLOADED',
  'JD_DELETED',
  'CANDIDATE_CREATED',
  'CANDIDATE_UPDATED',
  'CANDIDATE_DELETED',
  'CONSENT_RECORDED',
  'CV_UPLOADED',
  'ANALYSIS_RUN',
  'CV_VERSION_GENERATED',
  'CV_VERSION_EDITED',
  'CV_VERSION_EXPORTED',
  'SKILL_PROPOSED',
  'SKILL_ACCEPTED',
  'SKILL_REJECTED',
  'SKILL_VERIFIED',
  'PREP_GENERATED',
  'NAUKRI_SEARCH_GENERATED',
  'PIPELINE_UPDATED',
  'SOURCING_JOB_STARTED',
  'SOURCING_JOB_COMPLETED',
  'SETTINGS_UPDATED',
  'CREDENTIALS_UPDATED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Default scoring weights (percent). Overridable via env/settings. */
export const DEFAULT_SCORE_WEIGHTS = {
  skills: 35,
  experience: 25,
  keywords: 20,
  education: 10,
  atsHealth: 10,
} as const;
export type ScoreWeights = { [K in keyof typeof DEFAULT_SCORE_WEIGHTS]: number };

/** Deterministic scoring engine version — bump when scoring logic changes. */
export const MATCH_ENGINE_VERSION = '1.0.0';

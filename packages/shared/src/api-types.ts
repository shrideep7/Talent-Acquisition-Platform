import type { MatchBreakdown } from './analysis';
import type { CvChange, GeneratedCv, ParsedCv } from './cv';
import type { ParsedJd } from './jd';
import type { NaukriSearchCriteria } from './naukri';
import type { InterviewPrep } from './prep';
import type {
  CandidateSource,
  ConsentStatus,
  CvVersionStatus,
  PipelineStage,
  SkillMatchTier,
  SourcingJobStatus,
  UserRole,
  VerifiedSkillStatus,
} from './constants';

/** Shapes returned by the REST API (mirrors Prisma models minus internals). */

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResponseDto {
  accessToken: string;
  user: UserDto;
}

export interface JdDto {
  id: string;
  title: string;
  clientName: string;
  rawText: string;
  parsedCriteria: ParsedJd | null;
  fileName: string | null;
  createdById: string;
  createdBy?: UserDto;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  currentLocation: string | null;
  currentTitle: string | null;
  noticePeriod: string | null;
  totalYearsExperience: number | null;
  source: CandidateSource;
  consentStatus: ConsentStatus;
  consentAt: string | null;
  createdAt: string;
  updatedAt: string;
  cvDocuments?: CvDocumentDto[];
}

export interface CvDocumentDto {
  id: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
  ocrUsed: boolean;
  parsedText?: string;
  parsedCv?: ParsedCv | null;
  createdAt: string;
}

export interface MatchAnalysisDto {
  id: string;
  jdId: string;
  cvDocumentId: string | null;
  cvVersionId: string | null;
  candidateId: string;
  totalScore: number;
  breakdown: MatchBreakdown;
  engineVersion: string;
  createdById: string;
  createdAt: string;
  jd?: JdDto;
  candidate?: CandidateDto;
}

export interface CvVersionDto {
  id: string;
  candidateId: string;
  jdId: string;
  parentVersionId: string | null;
  versionNumber: number;
  content: GeneratedCv;
  changeLog: CvChange[];
  integrityNotes: string[];
  targetScore: number | null;
  achievedScore: number | null;
  status: CvVersionStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewPrepDto {
  id: string;
  jdId: string;
  candidateId: string;
  prep: InterviewPrep;
  createdAt: string;
}

export interface VerifiedSkillDto {
  id: string;
  candidateId: string;
  jdId: string | null;
  skill: string;
  tier: SkillMatchTier;
  status: VerifiedSkillStatus;
  evidence: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface PipelineEntryDto {
  id: string;
  jdId: string;
  candidateId: string;
  stage: PipelineStage;
  notes: string | null;
  latestScore: number | null;
  candidate?: CandidateDto;
  updatedAt: string;
}

export interface SourcingJobDto {
  id: string;
  jdId: string;
  provider: string;
  status: SourcingJobStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  createdAt: string;
  updatedAt: string;
  items?: SourcingJobItemDto[];
}

export interface SourcingJobItemDto {
  id: string;
  jobId: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  error: string | null;
  candidateId: string | null;
  analysisId: string | null;
  totalScore: number | null;
}

export interface NaukriSearchDto {
  criteria: NaukriSearchCriteria;
  /** Set when the extraction ran against a saved JD (rather than pasted text). */
  jdId: string | null;
  jdTitle: string | null;
  cached: boolean;
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

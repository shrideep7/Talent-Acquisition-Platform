import { z } from 'zod';

/** A single role/employment entry parsed from a CV. */
export const CvRoleSchema = z.object({
  employer: z.string().describe('Employer/company name exactly as written'),
  title: z.string().describe('Job title exactly as written'),
  startDate: z.string().nullable().describe('Start date as written, e.g. "Jan 2021"'),
  endDate: z.string().nullable().describe('End date as written, or null if current'),
  isCurrent: z.boolean().describe('Whether this is the current role'),
  location: z.string().nullable(),
  bullets: z.array(z.string()).describe('Responsibility/achievement bullets, verbatim content'),
  technologies: z.array(z.string()).describe('Technologies/skills evidenced in this role'),
});
export type CvRole = z.infer<typeof CvRoleSchema>;

export const CvEducationSchema = z.object({
  degree: z.string(),
  institution: z.string().nullable(),
  year: z.string().nullable(),
});
export type CvEducation = z.infer<typeof CvEducationSchema>;

export const CvCertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable(),
  year: z.string().nullable(),
});
export type CvCertification = z.infer<typeof CvCertificationSchema>;

export const CvProjectSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  technologies: z.array(z.string()),
});
export type CvProject = z.infer<typeof CvProjectSchema>;

/**
 * Structured content parsed from a candidate CV by the AI layer.
 * Strict schema forced onto Claude's output for CV parsing.
 * IMPORTANT: parsing must be faithful — no invention, no embellishment.
 */
export const ParsedCvSchema = z.object({
  fullName: z.string().describe('Candidate full name'),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable().describe('Current location if stated'),
  headline: z.string().nullable().describe('Professional headline/designation if present'),
  summary: z.string().nullable().describe('Profile summary as written, condensed if very long'),
  totalYearsExperience: z
    .number()
    .nullable()
    .describe('Total professional experience in years, computed from role dates or as stated'),
  noticePeriod: z.string().nullable().describe('Notice period if stated'),
  skills: z
    .array(
      z.object({
        name: z.string(),
        evidence: z
          .string()
          .nullable()
          .describe('Where in the CV this skill is evidenced (section/role), null if only listed'),
      }),
    )
    .describe('All skills found anywhere in the CV'),
  roles: z.array(CvRoleSchema),
  education: z.array(CvEducationSchema),
  certifications: z.array(CvCertificationSchema),
  projects: z.array(CvProjectSchema),
  languages: z.array(z.string()).describe('Spoken languages if listed'),
});
export type ParsedCv = z.infer<typeof ParsedCvSchema>;

// ---------------------------------------------------------------------------
// Generated (ATS-optimized) CV content — the editable, exportable structure.
// ---------------------------------------------------------------------------

export const GeneratedCvSchema = z.object({
  fullName: z.string(),
  headline: z.string().nullable().describe('One-line professional headline'),
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
  }),
  summary: z.string().describe('3-5 line professional summary, JD-aligned, truthful'),
  skills: z
    .array(
      z.object({
        category: z.string().describe('e.g. "Cloud & DevOps"'),
        items: z.array(z.string()),
      }),
    )
    .describe('Skills grouped by category, most JD-relevant categories first'),
  experience: z
    .array(
      z.object({
        employer: z.string(),
        title: z.string(),
        startDate: z.string().nullable().describe('Normalized format "MMM YYYY", e.g. "Jan 2021"'),
        endDate: z.string().nullable().describe('Normalized "MMM YYYY" or "Present"'),
        location: z.string().nullable(),
        bullets: z
          .array(z.string())
          .describe('Achievement bullets, most JD-relevant first, quantified where source facts allow'),
      }),
    )
    .describe('Roles in reverse-chronological order — employers, titles and dates must match the source CV exactly'),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string().nullable(),
      year: z.string().nullable(),
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable(),
      year: z.string().nullable(),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      technologies: z.array(z.string()),
    }),
  ),
});
export type GeneratedCv = z.infer<typeof GeneratedCvSchema>;

/** One entry in the what-changed-and-why log attached to every generated CV version. */
export const CvChangeSchema = z.object({
  section: z
    .string()
    .describe('CV section affected, e.g. "Summary", "Skills", "Experience — Infosys"'),
  changeType: z.enum([
    'rephrase',
    'terminology',
    'reorder',
    'quantify',
    'format',
    'skill_promotion',
    'condense',
  ]),
  before: z.string().nullable().describe('Original text (null for pure formatting/reordering)'),
  after: z.string().describe('New text or a description of the structural change'),
  reason: z.string().describe('Why this change raises the JD match / ATS score'),
  evidence: z
    .string()
    .describe('Citation to the source CV proving this change is truthful (quote or section reference)'),
  tier: z
    .enum(['EXPLICIT', 'TERMINOLOGY', 'INFERRED', 'UNVERIFIED_POSSIBLE', 'ABSENT'])
    .nullable()
    .describe('Skill tier for skill-related changes; null for non-skill changes'),
});
export type CvChange = z.infer<typeof CvChangeSchema>;

/** Full output of the CV rewrite AI call. */
export const CvRewriteResultSchema = z.object({
  cv: GeneratedCvSchema,
  changes: z.array(CvChangeSchema),
  integrityNotes: z
    .array(z.string())
    .describe('Anything the model chose NOT to change because it could not be evidenced'),
});
export type CvRewriteResult = z.infer<typeof CvRewriteResultSchema>;

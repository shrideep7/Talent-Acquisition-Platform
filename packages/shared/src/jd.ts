import { z } from 'zod';

/**
 * Structured criteria extracted from a Job Description by the AI layer.
 * This is the strict schema forced onto Claude's output for JD parsing.
 */
export const JdSkillRequirementSchema = z.object({
  name: z.string().describe('Canonical skill name exactly as the JD phrases it, e.g. "CI/CD"'),
  importance: z
    .enum(['must_have', 'nice_to_have'])
    .describe('Whether the JD treats this as mandatory or preferred'),
  category: z
    .string()
    .nullable()
    .describe('Skill grouping, e.g. "Cloud", "Languages", "Process". Null if unclear.'),
  aliases: z
    .array(z.string())
    .describe('Common alternative names/spellings for the same skill, e.g. ["Continuous Integration", "Jenkins pipelines"]'),
});
export type JdSkillRequirement = z.infer<typeof JdSkillRequirementSchema>;

export const ParsedJdSchema = z.object({
  title: z.string().describe('Job title'),
  seniorityLevel: z
    .string()
    .nullable()
    .describe('e.g. "Senior", "Lead", "5-8 years". Null if not stated.'),
  location: z.string().nullable().describe('Work location if stated'),
  workMode: z
    .enum(['onsite', 'hybrid', 'remote', 'unspecified'])
    .describe('Work arrangement'),
  minYearsExperience: z.number().nullable().describe('Minimum years of experience required'),
  maxYearsExperience: z.number().nullable().describe('Maximum years of experience, if a range is given'),
  domain: z
    .string()
    .nullable()
    .describe('Business/technical domain, e.g. "Banking", "Telecom", "ERP"'),
  noticePeriod: z.string().nullable().describe('Notice period requirement if stated'),
  budget: z.string().nullable().describe('Compensation/budget if stated'),
  requiredSkills: z.array(JdSkillRequirementSchema).describe('All skills the JD asks for'),
  responsibilities: z.array(z.string()).describe('Key responsibilities, condensed'),
  educationRequirements: z
    .array(z.string())
    .describe('Degrees/qualifications required, e.g. "B.E./B.Tech in CS"'),
  certifications: z.array(z.string()).describe('Certifications required or preferred'),
  keywords: z
    .array(z.string())
    .describe(
      'Ranked list of the most ATS-significant terms in the JD (most important first), using the JD\'s exact wording',
    ),
});
export type ParsedJd = z.infer<typeof ParsedJdSchema>;

import { z } from 'zod';

/**
 * Search-filter values for Naukri Resdex, extracted from a JD. Until the
 * Phase-3 Resdex API integration, recruiters copy these into Naukri's search
 * form manually — so every field mirrors a real Resdex filter input.
 */
export const NaukriSearchCriteriaSchema = z.object({
  booleanKeywords: z
    .string()
    .describe(
      'Ready-to-paste boolean search string for the Resdex Keywords field, e.g. ("Informatica" OR "Talend") AND "SQL" AND ("ETL" OR "Data Warehousing"). Group synonyms with OR, join core requirements with AND.',
    ),
  mustHaveKeywords: z
    .array(z.string())
    .describe('Core skills every result must have (the AND terms), most important first'),
  optionalKeywords: z
    .array(z.string())
    .describe('Nice-to-have terms that improve ranking but should not exclude candidates'),
  excludeKeywords: z
    .array(z.string())
    .describe('NOT terms that filter out clearly irrelevant profiles (unrelated stacks, "fresher" when senior is needed)'),
  itSkills: z
    .array(z.string())
    .describe('Values for the separate Resdex "IT skills" filter — concrete technologies only'),
  minExperienceYears: z.number().nullable().describe('Minimum total experience in years'),
  maxExperienceYears: z.number().nullable().describe('Maximum total experience in years'),
  currentLocations: z
    .array(z.string())
    .describe(
      'City names for the "Current location of candidate" filter, as Naukri lists them (e.g. "Bengaluru", "Pune"). Start with the JD location, then nearby/typical hub cities when relocation or hybrid is plausible.',
    ),
  minAnnualSalaryLakhs: z
    .number()
    .nullable()
    .describe('Annual salary filter lower bound, in INR lakhs'),
  maxAnnualSalaryLakhs: z
    .number()
    .nullable()
    .describe('Annual salary filter upper bound, in INR lakhs'),
  salaryNote: z
    .string()
    .nullable()
    .describe(
      'Where the salary range came from: quoted from the JD budget, or estimated from typical Indian market CTC for this role/experience — always say which.',
    ),
  noticePeriod: z
    .string()
    .nullable()
    .describe('Notice period filter suggestion, e.g. "Immediate to 30 days"'),
  designations: z
    .array(z.string())
    .describe('Current-designation search values — job titles candidates with this profile actually hold'),
  education: z
    .array(z.string())
    .describe('Degree filters if the JD requires them, e.g. "B.E/B.Tech", "MCA"'),
  industry: z.string().nullable().describe('Industry filter if the JD implies one'),
  searchTips: z
    .array(z.string())
    .describe(
      '3-6 short, practical tips for this specific search: what to broaden first if results are thin, what to tighten if flooded, alternate keyword combos worth trying.',
    ),
});
export type NaukriSearchCriteria = z.infer<typeof NaukriSearchCriteriaSchema>;

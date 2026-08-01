import type { ParsedJd } from '@mfd/shared';

/** Human-readable experience range from parsed JD criteria, '—' when unstated. */
export function experienceRange(parsed: ParsedJd | null | undefined): string {
  if (!parsed) return '—';
  const { minYearsExperience: min, maxYearsExperience: max } = parsed;
  if (min !== null && max !== null) return `${min}–${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  if (max !== null) return `up to ${max} yrs`;
  return '—';
}

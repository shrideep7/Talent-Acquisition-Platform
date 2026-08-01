import type { PipelineStage } from '@mfd/shared';

/** 'INTERNAL_INTERVIEW_DONE' → 'Internal Interview Done' */
export function humanizeStage(stage: string): string {
  return stage
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Badge tint per pipeline stage, matching the app's chip tones. */
export const STAGE_BADGE_CLASSES: Record<PipelineStage, string> = {
  SOURCED: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  CONTACTED: 'border-transparent bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  INTERESTED:
    'border-transparent bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  INTERNAL_INTERVIEW_DONE:
    'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  SENT_TO_CLIENT:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

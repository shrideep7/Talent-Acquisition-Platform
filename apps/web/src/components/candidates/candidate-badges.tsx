import type { CandidateSource, ConsentStatus } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CONSENT_STYLES: Record<ConsentStatus, string> = {
  GRANTED:
    'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  PENDING: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  REVOKED: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export function ConsentBadge({ status, className }: { status: ConsentStatus; className?: string }) {
  return <Badge className={cn(CONSENT_STYLES[status], 'shadow-none', className)}>{status}</Badge>;
}

const SOURCE_LABELS: Record<CandidateSource, string> = {
  MANUAL: 'Manual',
  BULK_UPLOAD: 'Bulk upload',
  NAUKRI: 'Naukri',
};

export function SourceBadge({ source, className }: { source: CandidateSource; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('shadow-none', className)}>
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateDto, CvDocumentDto } from '@mfd/shared';
import { FileText, Loader2, Plus, User, X } from 'lucide-react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/analyzer/entity-combobox';
import { FileDrop } from '@/components/file-drop';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

export interface CvInputCardProps {
  candidateId: string | null;
  cvDocumentId: string | null;
  onSelect: (candidateId: string, cvDocumentId: string | null) => void;
  canMutate: boolean;
}

function newestDoc(docs: CvDocumentDto[] | undefined): CvDocumentDto | undefined {
  if (!docs || docs.length === 0) return undefined;
  return [...docs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
}

const CONSENT_BADGE: Record<string, string> = {
  GRANTED: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  PENDING: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  REVOKED: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

export function CvInputCard({ candidateId, cvDocumentId, onSelect, canMutate }: CvInputCardProps) {
  const queryClient = useQueryClient();
  const [uploadMode, setUploadMode] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [consent, setConsent] = React.useState(false);

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['candidates'],
    queryFn: () => api.get<CandidateDto[]>('/candidates'),
  });

  const selected = React.useMemo(
    () => (candidateId ? candidates?.find((c) => c.id === candidateId) : undefined),
    [candidates, candidateId],
  );

  const docs = React.useMemo(() => selected?.cvDocuments ?? [], [selected]);

  // URL-prefilled candidate (or stale doc id): default to the newest CV document.
  React.useEffect(() => {
    if (!selected || docs.length === 0) return;
    if (cvDocumentId !== null && docs.some((doc) => doc.id === cvDocumentId)) return;
    const doc = newestDoc(docs);
    if (doc) onSelect(selected.id, doc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, docs, cvDocumentId]);

  const createCandidate = useMutation({
    mutationFn: async (): Promise<CandidateDto> => {
      if (!file) throw new Error('A CV file is required');
      const fields: Record<string, string> = { consent: consent ? 'true' : 'false' };
      if (fullName.trim()) fields.fullName = fullName.trim();
      return api.upload<CandidateDto>('/candidates', { cv: file }, fields);
    },
    onSuccess: (candidate) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      onSelect(candidate.id, newestDoc(candidate.cvDocuments)?.id ?? null);
      setUploadMode(false);
      setFile(null);
      setFullName('');
      setConsent(false);
      toast.success(`Candidate "${candidate.fullName}" created from CV`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const summaryParts = selected
    ? [
        selected.currentTitle,
        selected.totalYearsExperience !== null ? `${selected.totalYearsExperience} yrs exp` : null,
        selected.currentLocation,
        selected.noticePeriod ? `Notice: ${selected.noticePeriod}` : null,
      ].filter(Boolean)
    : [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="h-4 w-4 text-muted-foreground" />
          Candidate CV
        </CardTitle>
        {canMutate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadMode((v) => !v)}
            disabled={createCandidate.isPending}
          >
            {uploadMode ? (
              <>
                <X /> Cancel
              </>
            ) : (
              <>
                <Plus /> Upload new
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!uploadMode ? (
          <>
            <EntityCombobox
              items={candidates}
              isLoading={isLoading}
              value={candidateId}
              onSelect={(c) => onSelect(c.id, newestDoc(c.cvDocuments)?.id ?? null)}
              getKey={(c) => c.id}
              getLabel={(c) => c.fullName}
              getSublabel={(c) => c.currentTitle}
              placeholder="Select a candidate…"
              searchPlaceholder="Search candidates by name…"
              emptyText="No candidates found. Upload a CV to create one."
            />
            {selected && docs.length > 1 && (
              <div className="space-y-1.5">
                <Label>CV document</Label>
                <Select
                  value={cvDocumentId ?? undefined}
                  onValueChange={(docId) => onSelect(selected.id, docId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a CV document" />
                  </SelectTrigger>
                  <SelectContent>
                    {docs.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {doc.fileName} — {formatDate(doc.createdAt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selected ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selected.fullName}</span>
                {summaryParts.map((part) => (
                  <span key={String(part)}>{part}</span>
                ))}
                <Badge
                  variant="outline"
                  className={cn('font-normal', CONSENT_BADGE[selected.consentStatus])}
                >
                  Consent: {selected.consentStatus.toLowerCase()}
                </Badge>
                {docs.length === 1 && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <FileText className="h-3 w-3" /> {docs[0].fileName}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick an existing candidate{canMutate ? ' or upload a fresh CV' : ''}.
              </p>
            )}
            {selected && docs.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                This candidate has no CV documents — upload a CV to analyze.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {file ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFile(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <FileDrop accept="cv" onFiles={(files) => setFile(files[0] ?? null)} className="py-6" />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cv-fullname">Full name (optional override)</Label>
              <Input
                id="cv-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Leave blank to use the name parsed from the CV"
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="cv-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="cv-consent" className="text-sm font-normal leading-snug">
                Candidate consented to data processing for placement purposes
              </Label>
            </div>
            <Button
              className="w-full"
              disabled={!file || createCandidate.isPending}
              onClick={() => createCandidate.mutate()}
            >
              {createCandidate.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Uploading &amp; parsing…
                </>
              ) : (
                'Create candidate'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

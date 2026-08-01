'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JdDto } from '@mfd/shared';
import { Briefcase, FileText, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/analyzer/entity-combobox';
import { api } from '@/lib/api';
import { FileDrop } from '@/components/file-drop';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface JdInputCardProps {
  jdId: string | null;
  onSelect: (jdId: string) => void;
  canMutate: boolean;
}

export function JdInputCard({ jdId, onSelect, canMutate }: JdInputCardProps) {
  const queryClient = useQueryClient();
  const [uploadMode, setUploadMode] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [clientName, setClientName] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [rawText, setRawText] = React.useState('');

  const { data: jds, isLoading } = useQuery({
    queryKey: ['jds'],
    queryFn: () => api.get<JdDto[]>('/jds'),
  });

  const selected = React.useMemo(
    () => (jdId ? jds?.find((jd) => jd.id === jdId) : undefined),
    [jds, jdId],
  );

  const createJd = useMutation({
    mutationFn: async (): Promise<JdDto> => {
      const fields: Record<string, string> = { title: title.trim() };
      if (clientName.trim()) fields.clientName = clientName.trim();
      if (file) return api.upload<JdDto>('/jds', { file }, fields);
      return api.post<JdDto>('/jds', { ...fields, rawText });
    },
    onSuccess: (jd) => {
      queryClient.invalidateQueries({ queryKey: ['jds'] });
      onSelect(jd.id);
      setUploadMode(false);
      setTitle('');
      setClientName('');
      setFile(null);
      setRawText('');
      toast.success(`JD "${jd.title}" uploaded and parsed`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit =
    title.trim().length > 0 && (file !== null || rawText.trim().length > 0) && !createJd.isPending;

  const criteria = selected?.parsedCriteria;
  const expRange =
    criteria &&
    (criteria.minYearsExperience !== null || criteria.maxYearsExperience !== null)
      ? `${criteria.minYearsExperience ?? '?'}–${criteria.maxYearsExperience ?? '?'} yrs`
      : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Job Description
        </CardTitle>
        {canMutate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadMode((v) => !v)}
            disabled={createJd.isPending}
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
              items={jds}
              isLoading={isLoading}
              value={jdId}
              onSelect={(jd) => onSelect(jd.id)}
              getKey={(jd) => jd.id}
              getLabel={(jd) => jd.title}
              getSublabel={(jd) => jd.clientName || null}
              placeholder="Select a job description…"
              searchPlaceholder="Search JDs by title…"
              emptyText="No JDs found. Upload one to get started."
            />
            {selected ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selected.clientName || 'No client'}</span>
                {criteria ? (
                  <>
                    <Badge variant="secondary">{criteria.requiredSkills.length} skills</Badge>
                    {expRange && <Badge variant="secondary">{expRange}</Badge>}
                    {criteria.seniorityLevel && (
                      <Badge variant="secondary">{criteria.seniorityLevel}</Badge>
                    )}
                  </>
                ) : (
                  <span className="text-xs">Criteria not parsed yet</span>
                )}
                {selected.fileName && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <FileText className="h-3 w-3" /> {selected.fileName}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick an existing JD{canMutate ? ' or upload a new one' : ''}.
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="jd-title">Title *</Label>
                <Input
                  id="jd-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior DevOps Engineer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jd-client">Client</Label>
                <Input
                  id="jd-client"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
            </div>
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
              <FileDrop accept="jd" onFiles={(files) => setFile(files[0] ?? null)} className="py-6" />
            )}
            {!file && (
              <div className="space-y-1.5">
                <Label htmlFor="jd-text">…or paste the JD text</Label>
                <Textarea
                  id="jd-text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={5}
                  placeholder="Paste the full job description here"
                />
              </div>
            )}
            <Button className="w-full" disabled={!canSubmit} onClick={() => createJd.mutate()}>
              {createJd.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Uploading &amp; parsing…
                </>
              ) : (
                'Create JD'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

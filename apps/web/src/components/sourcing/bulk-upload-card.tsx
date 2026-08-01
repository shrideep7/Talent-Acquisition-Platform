'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SourcingJobDto } from '@mfd/shared';

import { FileDrop } from '@/components/file-drop';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface BulkUploadCardProps {
  jdId: string;
  onJobStarted: (job: SourcingJobDto) => void;
}

/** Staged multi-file CV upload that kicks off a sourcing bulk-analysis job. */
export function BulkUploadCard({ jdId, onJobStarted }: BulkUploadCardProps) {
  const queryClient = useQueryClient();
  const [staged, setStaged] = React.useState<File[]>([]);

  const addFiles = React.useCallback((files: File[]) => {
    setStaged((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...files.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }, []);

  const removeFile = (index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadMutation = useMutation({
    mutationFn: () => api.upload<SourcingJobDto>('/sourcing/bulk-upload', { files: staged }, { jdId }),
    onSuccess: (job) => {
      toast.success(`Bulk analysis started for ${job.totalItems} CV${job.totalItems === 1 ? '' : 's'}`);
      setStaged([]);
      void queryClient.invalidateQueries({ queryKey: ['sourcing-jobs', jdId] });
      onJobStarted(job);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Bulk upload failed');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk CV Upload</CardTitle>
        <CardDescription>
          Drop exported CVs here — each one is parsed and scored against the selected JD.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDrop accept="bulk" multiple onFiles={addFiles} disabled={uploadMutation.isPending} />

        {staged.length > 0 && (
          <ul className="max-h-52 space-y-1.5 overflow-y-auto">
            {staged.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => removeFile(index)}
                  disabled={uploadMutation.isPending}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={staged.length === 0 || uploadMutation.isPending}
          >
            {uploadMutation.isPending && <Loader2 className="animate-spin" />}
            Analyze {staged.length > 0 ? staged.length : ''} CV{staged.length === 1 ? '' : 's'} against
            this JD
          </Button>
          {staged.length > 0 && !uploadMutation.isPending && (
            <Button variant="ghost" size="sm" onClick={() => setStaged([])}>
              Clear all
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

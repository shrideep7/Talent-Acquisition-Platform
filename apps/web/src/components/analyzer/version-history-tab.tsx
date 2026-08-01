'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CvVersionDto, CvVersionStatus } from '@mfd/shared';
import { Download, History, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, formatDateTime, scoreColor } from '@/lib/utils';

export interface VersionHistoryTabProps {
  jdId: string;
  candidateId: string;
  activeVersionId: string | null;
  onLoad: (version: CvVersionDto) => void;
  canMutate: boolean;
}

const STATUS_CLASSES: Record<CvVersionStatus, string> = {
  DRAFT: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-700/60 dark:text-slate-200',
  EDITED: 'border-transparent bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  EXPORTED:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
};

export function VersionHistoryTab({
  jdId,
  candidateId,
  activeVersionId,
  onLoad,
  canMutate,
}: VersionHistoryTabProps) {
  const queryClient = useQueryClient();
  const { data: versions, isLoading } = useQuery({
    queryKey: ['cv-versions', candidateId, jdId],
    queryFn: () =>
      api.get<CvVersionDto[]>(`/cv-versions?candidateId=${candidateId}&jdId=${jdId}`),
  });

  const [exportingId, setExportingId] = React.useState<string | null>(null);
  const handleExport = async (version: CvVersionDto, format: 'docx' | 'pdf') => {
    setExportingId(version.id);
    try {
      await api.download(
        `/cv-versions/${version.id}/export?format=${format}`,
        `cv-v${version.versionNumber}.${format}`,
      );
      queryClient.invalidateQueries({ queryKey: ['cv-versions'] });
      toast.success(`Exported v${version.versionNumber} as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Version history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : !versions || versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No CV versions yet for this candidate + JD. Generate one from the Optimize CV tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Achieved</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow
                    key={version.id}
                    className={cn(version.id === activeVersionId && 'bg-muted/50')}
                  >
                    <TableCell className="font-medium">
                      v{version.versionNumber}
                      {version.id === activeVersionId && (
                        <Badge variant="secondary" className="ml-2 font-normal">
                          in editor
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {version.targetScore ?? '—'}
                    </TableCell>
                    <TableCell>
                      {version.achievedScore !== null ? (
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            scoreColor(version.achievedScore),
                          )}
                        >
                          {Math.round(version.achievedScore)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('font-normal', STATUS_CLASSES[version.status])}
                      >
                        {version.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(version.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => onLoad(version)}>
                          <Pencil /> Load into editor
                        </Button>
                        {canMutate && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={exportingId === version.id}
                              onClick={() => handleExport(version, 'docx')}
                            >
                              <Download /> DOCX
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={exportingId === version.id}
                              onClick={() => handleExport(version, 'pdf')}
                            >
                              <Download /> PDF
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

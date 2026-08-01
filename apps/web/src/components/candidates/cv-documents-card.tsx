'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import type { CvDocumentDto } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export function CvDocumentsCard({
  candidateId,
  documents,
}: {
  candidateId: string;
  documents: CvDocumentDto[];
}) {
  const [viewDoc, setViewDoc] = React.useState<CvDocumentDto | null>(null);

  const textQuery = useQuery({
    queryKey: ['cv-text', candidateId, viewDoc?.id],
    queryFn: () =>
      api.get<{ text: string }>(`/candidates/${candidateId}/cv-documents/${viewDoc!.id}/text`),
    enabled: viewDoc !== null,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">CV Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No CV documents on file.
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                  </div>
                  {doc.ocrUsed && (
                    <Badge className="border-transparent bg-amber-100 text-amber-800 shadow-none dark:bg-amber-950 dark:text-amber-300">
                      OCR
                    </Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setViewDoc(doc)}>
                  View text
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={viewDoc !== null}
        onOpenChange={(next) => {
          if (!next) setViewDoc(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewDoc?.fileName}</DialogTitle>
            <DialogDescription>
              Parsed text as used by the matching engine
              {viewDoc?.ocrUsed ? ' (extracted via OCR)' : ''}.
            </DialogDescription>
          </DialogHeader>
          {textQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : textQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load the document text.</p>
          ) : (
            <ScrollArea className="h-[60vh] rounded-md border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {textQuery.data?.text || 'No text extracted.'}
              </pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

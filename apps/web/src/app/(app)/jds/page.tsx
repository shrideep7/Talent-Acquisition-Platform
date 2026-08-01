'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Eye, FileSearch, Search, Trash2 } from 'lucide-react';
import type { JdDto } from '@mfd/shared';

import { AddJdDialog } from '@/components/jds/add-jd-dialog';
import { DeleteJdDialog } from '@/components/jds/delete-jd-dialog';
import { experienceRange } from '@/components/jds/jd-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useAuth } from '@/lib/use-auth';
import { formatDate } from '@/lib/utils';

export default function JdsPage() {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<JdDto | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const jdsQuery = useQuery({
    queryKey: ['jds', debounced],
    queryFn: () =>
      api.get<JdDto[]>(`/jds${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}`),
  });
  const jds = jdsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job Descriptions</h1>
          <p className="text-muted-foreground">
            Manage client requisitions and their parsed matching criteria.
          </p>
        </div>
        {!isViewer && <AddJdDialog />}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-center">Skills</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jdsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : jds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-8 w-8" />
                      <p className="text-sm">
                        {debounced
                          ? `No job descriptions match "${debounced}".`
                          : 'No job descriptions yet. Add one to get started.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                jds.map((jd) => (
                  <TableRow key={jd.id}>
                    <TableCell className="max-w-[16rem] font-medium">
                      <Link href={`/jds/${jd.id}`} className="block truncate hover:underline">
                        {jd.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{jd.clientName}</TableCell>
                    <TableCell className="text-center">
                      {jd.parsedCriteria ? (
                        <Badge variant="secondary" className="tabular-nums">
                          {jd.parsedCriteria.requiredSkills.length}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">pending</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {experienceRange(jd.parsedCriteria)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(jd.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/analyzer?jdId=${jd.id}`}>
                            <FileSearch className="mr-1 h-3.5 w-3.5" />
                            Analyze
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/jds/${jd.id}`}>
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </Link>
                        </Button>
                        {!isViewer && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(jd)}
                            aria-label={`Delete ${jd.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {deleteTarget && (
        <DeleteJdDialog
          jdId={deleteTarget.id}
          jdTitle={deleteTarget.title}
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import type { CandidateDto } from '@mfd/shared';

import { AddCandidateDialog } from '@/components/candidates/add-candidate-dialog';
import { ConsentBadge, SourceBadge } from '@/components/candidates/candidate-badges';
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

export default function CandidatesPage() {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const candidatesQuery = useQuery({
    queryKey: ['candidates', debounced],
    queryFn: () =>
      api.get<CandidateDto[]>(
        `/candidates${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}`,
      ),
  });
  const candidates = candidatesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground">
            The candidate pool — CVs, consent status and match history in one place.
          </p>
        </div>
        {!isViewer && <AddCandidateDialog />}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name…"
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
                <TableHead>Name</TableHead>
                <TableHead>Current title</TableHead>
                <TableHead className="text-center">Experience (yrs)</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Notice</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidatesQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-36 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Users className="h-8 w-8" />
                      <p className="text-sm">
                        {debounced
                          ? `No candidates match "${debounced}".`
                          : 'No candidates yet. Upload a CV to add the first one.'}
                      </p>
                      {!debounced && !isViewer && (
                        <AddCandidateDialog
                          trigger={<Button variant="outline">Add Candidate</Button>}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="max-w-[14rem] font-medium">
                      <Link
                        href={`/candidates/${candidate.id}`}
                        className="block truncate hover:underline"
                      >
                        {candidate.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                      {candidate.currentTitle ?? '—'}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {candidate.totalYearsExperience ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {candidate.currentLocation ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {candidate.noticePeriod ?? '—'}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={candidate.source} />
                    </TableCell>
                    <TableCell>
                      <ConsentBadge status={candidate.consentStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(candidate.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

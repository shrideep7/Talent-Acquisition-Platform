'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { AUDIT_ACTIONS, type AuditLogDto } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 50;
const ALL_ACTIONS = 'ALL';

interface Filters {
  action: string;
  entityType: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { action: ALL_ACTIONS, entityType: '', from: '', to: '' };

function buildQuery(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  if (filters.action !== ALL_ACTIONS) params.set('action', filters.action);
  if (filters.entityType.trim()) params.set('entityType', filters.entityType.trim());
  if (filters.from) params.set('from', `${filters.from}T00:00:00.000Z`);
  if (filters.to) params.set('to', `${filters.to}T23:59:59.999Z`);
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  return params.toString();
}

function DetailCell({ detail }: { detail: AuditLogDto['detail'] }) {
  if (!detail) return <span className="text-muted-foreground">—</span>;
  const compact = JSON.stringify(detail);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block max-w-[16rem] cursor-default truncate font-mono text-xs text-muted-foreground">
          {compact}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <pre className="whitespace-pre-wrap break-all font-mono text-xs">
          {JSON.stringify(detail, null, 2)}
        </pre>
      </TooltipContent>
    </Tooltip>
  );
}

export default function AuditPage() {
  const { user } = useAuth();

  const [draft, setDraft] = React.useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = React.useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);

  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit', applied, page],
    queryFn: () =>
      api.get<{ items: AuditLogDto[]; total: number }>(`/audit-log?${buildQuery(applied, page)}`),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
  });

  if (!user) {
    // Auth state resolves from localStorage after mount — avoid a flash of the wrong view.
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="text-muted-foreground">Every sensitive action, recorded immutably.</p>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              The audit log is only available to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const apply = () => {
    setApplied(draft);
    setPage(1);
  };

  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-muted-foreground">
          Every sensitive action — logins, uploads, exports, consent and settings changes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select
                value={draft.action}
                onValueChange={(action) => setDraft((p) => ({ ...p, action }))}
              >
                <SelectTrigger className="h-9 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
                  {AUDIT_ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-entity-type" className="text-xs text-muted-foreground">
                Entity type
              </Label>
              <Input
                id="audit-entity-type"
                value={draft.entityType}
                onChange={(e) => setDraft((p) => ({ ...p, entityType: e.target.value }))}
                placeholder="e.g. candidate"
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="audit-from"
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="audit-to"
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))}
                className="h-9 w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={apply}>Apply</Button>
              <Button variant="outline" onClick={clear}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Could not load the audit log.
            </p>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <p className="text-sm font-medium">No audit entries</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing matches the current filters.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate">
                          {entry.userEmail ?? (
                            <span className="text-muted-foreground">system</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[11px] font-normal">
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{entry.entityType}</span>
                          {entry.entityId && (
                            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                              {entry.entityId.slice(0, 8)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DetailCell detail={entry.detail} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm tabular-nums text-muted-foreground">
                  {start}–{end} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={end >= total}
                  >
                    Next
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Pencil, Phone, Plus, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { JdDto, VendorDto } from '@mfd/shared';

import { ShareJdDialog } from '@/components/vendors/share-jd-dialog';
import { VendorDialog } from '@/components/vendors/vendor-dialog';
import { EntityCombobox } from '@/components/analyzer/entity-combobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn, formatDate } from '@/lib/utils';

export default function VendorsPage() {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [editing, setEditing] = React.useState<VendorDto | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<VendorDto | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareJdId, setShareJdId] = React.useState<string | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ['vendors', debounced],
    queryFn: () =>
      api.get<VendorDto[]>(`/vendors${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}`),
  });
  const vendors = vendorsQuery.data ?? [];
  const activeCount = vendors.filter((v) => v.status === 'ACTIVE').length;

  const { data: jds } = useQuery({
    queryKey: ['jds'],
    queryFn: () => api.get<JdDto[]>('/jds'),
  });
  const selectedJd = React.useMemo(
    () => (shareJdId ? jds?.find((j) => j.id === shareJdId) : undefined),
    [jds, shareJdId],
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/vendors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(`${deleting?.companyName} removed`);
      setDeleting(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">
            Your CV-supply partners — keep the directory current and email a JD to all of them in
            one click.
          </p>
        </div>
        {!isViewer && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        )}
      </div>

      {/* Share a JD */}
      {!isViewer && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-[16rem] flex-1 space-y-1.5">
              <p className="text-sm font-medium">Share a JD with vendors</p>
              <EntityCombobox
                items={jds}
                value={shareJdId}
                onSelect={(jd) => setShareJdId(jd.id)}
                getKey={(jd) => jd.id}
                getLabel={(jd) => jd.title}
                getSublabel={(jd) => jd.clientName || null}
                placeholder="Select a job description…"
                searchPlaceholder="Search JDs…"
              />
            </div>
            <Button
              disabled={!selectedJd || activeCount === 0}
              onClick={() => setShareOpen(true)}
            >
              <Send className="h-4 w-4" />
              Share with {activeCount} active vendor{activeCount === 1 ? '' : 's'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search agency, contact or specialization…"
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
                <TableHead>Agency</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Specializations</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">JDs sent</TableHead>
                <TableHead>Last shared</TableHead>
                {!isViewer && <TableHead className="w-[5.5rem]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isViewer ? 6 : 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isViewer ? 6 : 7} className="h-36 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Building2 className="h-8 w-8" />
                      <p className="text-sm">
                        {debounced
                          ? `No vendors match "${debounced}".`
                          : 'No vendors yet. Add your CV-supply partners to start sharing JDs.'}
                      </p>
                      {!debounced && !isViewer && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditing(undefined);
                            setDialogOpen(true);
                          }}
                        >
                          Add Vendor
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="max-w-[14rem] font-medium">
                      <span className="block truncate">{vendor.companyName}</span>
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <span className="block truncate">{vendor.contactName}</span>
                      <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        {vendor.email && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3 shrink-0" />
                            {vendor.email}
                          </span>
                        )}
                        {vendor.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {vendor.phone}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      {vendor.specializations.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {vendor.specializations.map((s) => (
                            <Badge key={s} variant="secondary" className="font-normal">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'shadow-none',
                          vendor.status === 'ACTIVE'
                            ? 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
                        )}
                      >
                        {vendor.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {vendor.sharesCount ?? 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {vendor.lastSharedAt ? formatDate(vendor.lastSharedAt) : '—'}
                    </TableCell>
                    {!isViewer && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Edit ${vendor.companyName}`}
                            onClick={() => {
                              setEditing(vendor);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`Remove ${vendor.companyName}`}
                            onClick={() => setDeleting(vendor)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <VendorDialog vendor={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      {selectedJd && (
        <ShareJdDialog jd={selectedJd} open={shareOpen} onOpenChange={setShareOpen} />
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove vendor?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{deleting?.companyName}</span> will stop
            receiving JD blasts. The record of JDs already sent to them is kept.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

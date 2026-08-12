'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Mail, Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { JdDto, ShareJdResultDto, VendorDto } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/** Blast a JD to selected vendors as individual, personalized emails. */
export function ShareJdDialog({
  jd,
  open,
  onOpenChange,
}: {
  jd: JdDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [selected, setSelected] = React.useState<string[] | null>(null); // null = all active
  const [note, setNote] = React.useState('');
  const [includeClientName, setIncludeClientName] = React.useState(false);
  const [attachJdFile, setAttachJdFile] = React.useState(true);
  const [resend, setResend] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [result, setResult] = React.useState<ShareJdResultDto | null>(null);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors', 'ACTIVE'],
    queryFn: () => api.get<VendorDto[]>('/vendors?status=ACTIVE'),
    enabled: open,
  });
  const { data: config } = useQuery({
    queryKey: ['vendors-config'],
    queryFn: () => api.get<{ mode: 'smtp' | 'simulated' }>('/vendors/config'),
    enabled: open,
  });

  React.useEffect(() => {
    if (open) {
      setResult(null);
      setSelected(null);
      setResend(false);
      setSearch('');
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const list = vendors ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (v) =>
        v.companyName.toLowerCase().includes(q) ||
        v.contactName.toLowerCase().includes(q) ||
        v.specializations.some((s) => s.toLowerCase().includes(q)),
    );
  }, [vendors, search]);

  const allIds = (vendors ?? []).map((v) => v.id);
  const effectiveIds = selected ?? allIds;

  const share = useMutation({
    mutationFn: () =>
      api.post<ShareJdResultDto>('/vendors/share-jd', {
        jdId: jd.id,
        ...(selected ? { vendorIds: selected } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        includeClientName,
        attachJdFile,
        resend,
      }),
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['jd-shares', jd.id] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      if (res.sent.length > 0) {
        toast.success(`JD sent to ${res.sent.length} vendor${res.sent.length === 1 ? '' : 's'}`);
      } else if (res.skippedAlreadyShared.length > 0) {
        toast.info('All selected vendors already received this JD');
      }
      if (res.failed.length > 0) {
        toast.error(`${res.failed.length} email(s) failed — see the details`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleVendor = (id: string) => {
    const current = selected ?? allIds;
    setSelected(current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Share JD with vendors
            {config?.mode === 'simulated' && (
              <Badge variant="outline" className="font-normal">
                simulated — no email actually sent
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{jd.title}</span> — each vendor receives
            their own personalized email (never a shared CC/BCC), with the requirement summary and
            instructions to reply with CVs.
          </p>

          {result ? (
            <ShareResult result={result} />
          ) : (
            <>
              {/* Vendor picker */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    Recipients{' '}
                    <span className="font-normal text-muted-foreground">
                      ({effectiveIds.length} of {allIds.length} active)
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                      Clear
                    </Button>
                  </div>
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by agency, contact or specialization…"
                  className="h-8"
                />
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-1">
                  {isLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">Loading vendors…</p>
                  ) : filtered.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      {allIds.length === 0
                        ? 'No active vendors yet — add them on the Vendors page.'
                        : 'No vendors match that filter.'}
                    </p>
                  ) : (
                    filtered.map((vendor) => {
                      const checked = effectiveIds.includes(vendor.id);
                      return (
                        <button
                          key={vendor.id}
                          type="button"
                          onClick={() => toggleVendor(vendor.id)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary',
                              checked ? 'bg-primary text-primary-foreground' : 'opacity-50',
                            )}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{vendor.companyName}</span>
                            <span className="text-muted-foreground"> · {vendor.contactName}</span>
                          </span>
                          {vendor.specializations.slice(0, 2).map((s) => (
                            <Badge key={s} variant="secondary" className="font-normal">
                              {s}
                            </Badge>
                          ))}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="share-note">Note to vendors (optional)</Label>
                <Textarea
                  id="share-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Urgent — need 5 profiles by Friday. Only immediate joiners."
                />
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <Toggle
                  checked={attachJdFile}
                  onChange={setAttachJdFile}
                  label="Attach the original JD document"
                  hint={
                    jd.fileName
                      ? `${jd.fileName} — when off, the full JD text is included in the email body`
                      : 'No file was uploaded for this JD; the full text is included in the body'
                  }
                />
                <Toggle
                  checked={includeClientName}
                  onChange={setIncludeClientName}
                  label={`Reveal the client name (${jd.clientName})`}
                  hint="Off by default — vendors who know the end client can approach them directly."
                />
                <Toggle
                  checked={resend}
                  onChange={setResend}
                  label="Resend to vendors who already received this JD"
                  hint="Off by default, so repeat blasts only reach new vendors."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              disabled={effectiveIds.length === 0 || share.isPending}
              onClick={() => share.mutate()}
            >
              {share.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Send to {effectiveIds.length} vendor{effectiveIds.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareResult({ result }: { result: ShareJdResultDto }) {
  return (
    <div className="space-y-3">
      {result.sent.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">
            <Check className="h-4 w-4" />
            Sent to {result.sent.length} vendor{result.sent.length === 1 ? '' : 's'}
            {result.sent[0]?.attached && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Paperclip className="h-3 w-3" /> JD attached
              </Badge>
            )}
          </p>
          <ul className="space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
            {result.sent.map((s) => (
              <li key={s.id}>{s.vendorCompanyName}</li>
            ))}
          </ul>
        </div>
      )}

      {result.failed.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          <p className="flex items-center gap-2 text-sm font-medium text-red-900 dark:text-red-200">
            <AlertTriangle className="h-4 w-4" />
            {result.failed.length} failed
          </p>
          <ul className="space-y-0.5 text-sm text-red-900 dark:text-red-200">
            {result.failed.map((s) => (
              <li key={s.id}>
                {s.vendorCompanyName} — {s.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.skippedAlreadyShared.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <span className="font-medium">Skipped (already received this JD): </span>
          {result.skippedAlreadyShared.join(', ')}
          <span className="block text-xs">Tick “Resend” to send it to them again.</span>
        </div>
      )}
    </div>
  );
}

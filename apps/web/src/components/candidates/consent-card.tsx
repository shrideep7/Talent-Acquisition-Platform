'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import type { CandidateDto } from '@mfd/shared';

import { ConsentBadge } from '@/components/candidates/candidate-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export function ConsentCard({
  candidate,
  isViewer,
}: {
  candidate: CandidateDto;
  isViewer: boolean;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<'grant' | 'revoke' | null>(null);
  const [note, setNote] = React.useState('');

  const record = useMutation({
    mutationFn: (granted: boolean) =>
      api.post<CandidateDto>(`/candidates/${candidate.id}/consent`, {
        granted,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (_, granted) => {
      toast.success(granted ? 'Consent recorded as granted' : 'Consent recorded as revoked');
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      setDialog(null);
      setNote('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to record consent');
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Consent (DPDP)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Status</span>
          <ConsentBadge status={candidate.consentStatus} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Last recorded</span>
          <span className="text-sm">
            {candidate.consentAt ? formatDateTime(candidate.consentAt) : '—'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Consent changes are written to the audit trail with the note you provide.
        </p>
        {!isViewer && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setDialog('grant')}
              disabled={candidate.consentStatus === 'GRANTED'}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4 text-emerald-600" />
              Grant
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setDialog('revoke')}
              disabled={candidate.consentStatus === 'REVOKED'}
            >
              <ShieldX className="mr-1.5 h-4 w-4 text-red-600" />
              Revoke
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => {
          if (record.isPending) return;
          if (!next) {
            setDialog(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'grant' ? 'Record consent as granted' : 'Record consent as revoked'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'grant'
                ? `Confirm that ${candidate.fullName} has consented to processing of their data for placement purposes.`
                : `Record that ${candidate.fullName} has withdrawn consent. Their data should then be erased on request.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="consent-note">Note (optional)</Label>
            <Textarea
              id="consent-note"
              placeholder="e.g. Consent confirmed over phone call on…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={record.isPending}>
              Cancel
            </Button>
            <Button
              variant={dialog === 'revoke' ? 'destructive' : 'default'}
              onClick={() => record.mutate(dialog === 'grant')}
              disabled={record.isPending}
            >
              {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog === 'grant' ? 'Record grant' : 'Record revocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

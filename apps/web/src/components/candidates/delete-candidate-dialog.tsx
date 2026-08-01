'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export interface DeleteCandidateDialogProps {
  candidateId: string;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful erasure (e.g. navigate back to the list). */
  onDeleted?: () => void;
}

export function DeleteCandidateDialog({
  candidateId,
  candidateName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteCandidateDialogProps) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = React.useState('');

  const remove = useMutation({
    mutationFn: () => api.delete<unknown>(`/candidates/${candidateId}`),
    onSuccess: () => {
      toast.success(`All data for "${candidateName}" has been erased`);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to erase candidate data');
    },
  });

  const nameMatches = confirmation.trim() === candidateName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        onOpenChange(next);
        if (!next) setConfirmation('');
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            DPDP erasure — delete candidate?
          </DialogTitle>
          <DialogDescription>
            This permanently erases <span className="font-medium">{candidateName}</span> and every
            record derived from their data: uploaded CV files, parsed documents, match analyses,
            generated CV versions, interview preps and pipeline entries. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Type <span className="font-semibold">{candidateName}</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={candidateName}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={!nameMatches || remove.isPending}
          >
            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Erase permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

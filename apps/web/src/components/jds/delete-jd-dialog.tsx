'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { api } from '@/lib/api';

export interface DeleteJdDialogProps {
  jdId: string;
  jdTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. navigate away from a detail page). */
  onDeleted?: () => void;
}

export function DeleteJdDialog({ jdId, jdTitle, open, onOpenChange, onDeleted }: DeleteJdDialogProps) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.delete<{ success: true }>(`/jds/${jdId}`),
    onSuccess: () => {
      toast.success(`JD "${jdTitle}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['jds'] });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete JD');
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete job description?</DialogTitle>
          <DialogDescription>
            &ldquo;{jdTitle}&rdquo; will be removed from the platform. Existing analyses remain in
            the audit trail, but the JD will no longer be listed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

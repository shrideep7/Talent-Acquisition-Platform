'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CandidateDto } from '@mfd/shared';

import { FileDrop } from '@/components/file-drop';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export function AddCandidateDialog({ trigger }: { trigger?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [consent, setConsent] = React.useState(false);

  const reset = () => {
    setFile(null);
    setFullName('');
    setConsent(false);
  };

  const create = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('A CV file is required');
      const fields: Record<string, string> = { consent: String(consent) };
      if (fullName.trim()) fields.fullName = fullName.trim();
      return api.upload<CandidateDto>('/candidates', { cv: file }, fields);
    },
    onSuccess: (candidate) => {
      toast.success(`Candidate "${candidate.fullName}" added`);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      reset();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add candidate');
    },
  });

  const canSubmit = file !== null && !create.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (create.isPending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Candidate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add candidate</DialogTitle>
          <DialogDescription>
            Upload the candidate&apos;s CV — profile details are extracted automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>
              CV file <span className="text-destructive">*</span>
            </Label>
            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{file.name}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setFile(null)}
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <FileDrop accept="cv" onFiles={(files) => setFile(files[0] ?? null)} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="candidate-name">Full name (optional)</Label>
            <Input
              id="candidate-name"
              placeholder="Overrides the name parsed from the CV"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <Checkbox
              id="candidate-consent"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="candidate-consent" className="text-sm font-normal leading-snug">
              Candidate has consented to processing of their data for placement purposes (DPDP)
            </Label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add candidate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

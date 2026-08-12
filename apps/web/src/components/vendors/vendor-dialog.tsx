'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { VendorDto, VendorStatus } from '@mfd/shared';

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

/** Add or edit a vendor. Pass `vendor` to edit, omit to create. */
export function VendorDialog({
  vendor,
  open,
  onOpenChange,
}: {
  vendor?: VendorDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(vendor);

  const [companyName, setCompanyName] = React.useState('');
  const [contactName, setContactName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [status, setStatus] = React.useState<VendorStatus>('ACTIVE');
  const [specializations, setSpecializations] = React.useState<string[]>([]);
  const [specInput, setSpecInput] = React.useState('');
  const [notes, setNotes] = React.useState('');

  // Reset the form whenever the dialog opens for a different vendor.
  React.useEffect(() => {
    if (!open) return;
    setCompanyName(vendor?.companyName ?? '');
    setContactName(vendor?.contactName ?? '');
    setEmail(vendor?.email ?? '');
    setPhone(vendor?.phone ?? '');
    setStatus(vendor?.status ?? 'ACTIVE');
    setSpecializations(vendor?.specializations ?? []);
    setSpecInput('');
    setNotes(vendor?.notes ?? '');
  }, [open, vendor]);

  const addSpec = () => {
    const value = specInput.trim();
    if (!value) return;
    if (!specializations.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setSpecializations((prev) => [...prev, value]);
    }
    setSpecInput('');
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        status,
        specializations,
        notes: notes.trim(),
      };
      return isEdit
        ? api.patch<VendorDto>(`/vendors/${vendor!.id}`, body)
        : api.post<VendorDto>('/vendors', body);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(isEdit ? `${saved.companyName} updated` : `${saved.companyName} added`);
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave =
    companyName.trim().length > 0 &&
    contactName.trim().length > 0 &&
    email.trim().length > 0 &&
    !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'Add vendor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-company">Agency / company *</Label>
              <Input
                id="v-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. TalentBridge Consulting"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-contact">Contact person *</Label>
              <Input
                id="v-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Priya Nair"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-email">Email *</Label>
              <Input
                id="v-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="priya@talentbridge.in"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-phone">Phone</Label>
              <Input
                id="v-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-spec">Specializations</Label>
            <div className="flex gap-2">
              <Input
                id="v-spec"
                value={specInput}
                onChange={(e) => setSpecInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSpec();
                  }
                }}
                placeholder="e.g. Data Engineering — press Enter to add"
              />
              <Button type="button" variant="outline" onClick={addSpec} disabled={!specInput.trim()}>
                Add
              </Button>
            </div>
            {specializations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {specializations.map((spec) => (
                  <Badge key={spec} variant="secondary" className="gap-1 pr-1 font-normal">
                    {spec}
                    <button
                      type="button"
                      aria-label={`Remove ${spec}`}
                      onClick={() =>
                        setSpecializations((prev) => prev.filter((s) => s !== spec))
                      }
                      className="rounded-full p-0.5 hover:bg-background/60"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Used to target a JD blast at the right agencies.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">
              {(['ACTIVE', 'INACTIVE'] as VendorStatus[]).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={status === option ? 'default' : 'outline'}
                  onClick={() => setStatus(option)}
                >
                  {option === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Only active vendors receive JD blasts.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-notes">Notes</Label>
            <Textarea
              id="v-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Commercial terms, typical turnaround, quality notes…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add vendor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

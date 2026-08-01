'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JdDto } from '@mfd/shared';

import { FileDrop } from '@/components/file-drop';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export function AddJdDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [clientName, setClientName] = React.useState('NTT DATA');
  const [mode, setMode] = React.useState<'upload' | 'paste'>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [rawText, setRawText] = React.useState('');

  const reset = () => {
    setTitle('');
    setClientName('NTT DATA');
    setMode('upload');
    setFile(null);
    setRawText('');
  };

  const create = useMutation({
    mutationFn: () => {
      if (mode === 'upload' && file) {
        return api.upload<JdDto>('/jds', { file }, { title: title.trim(), clientName });
      }
      return api.post<JdDto>('/jds', {
        title: title.trim(),
        clientName,
        rawText,
      });
    },
    onSuccess: (jd) => {
      toast.success(`JD "${jd.title}" created`);
      queryClient.invalidateQueries({ queryKey: ['jds'] });
      reset();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create JD');
    },
  });

  const canSubmit =
    title.trim().length > 0 &&
    (mode === 'upload' ? file !== null : rawText.trim().length > 0) &&
    !create.isPending;

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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add JD
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add job description</DialogTitle>
          <DialogDescription>
            Upload a JD file or paste the text — criteria are extracted automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jd-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="jd-title"
              placeholder="e.g. Senior Java Developer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jd-client">Client name</Label>
            <Input
              id="jd-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'upload' | 'paste')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Upload file</TabsTrigger>
              <TabsTrigger value="paste">Paste text</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-3">
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
                <FileDrop accept="jd" onFiles={(files) => setFile(files[0] ?? null)} />
              )}
            </TabsContent>
            <TabsContent value="paste" className="mt-3">
              <Textarea
                placeholder="Paste the full JD text here…"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
              />
            </TabsContent>
          </Tabs>
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
              Create JD
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

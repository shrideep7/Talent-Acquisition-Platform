'use client';

import * as React from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { Upload } from 'lucide-react';

import { cn } from '@/lib/utils';

const PDF: Accept = { 'application/pdf': ['.pdf'] };
const DOCX: Accept = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
const TXT: Accept = { 'text/plain': ['.txt'] };

const ACCEPT_MAP: Record<'cv' | 'jd' | 'bulk', Accept> = {
  cv: { ...PDF, ...DOCX },
  jd: { ...PDF, ...DOCX, ...TXT },
  bulk: { ...PDF, ...DOCX },
};

const HINT_MAP: Record<'cv' | 'jd' | 'bulk', string> = {
  cv: 'PDF or DOCX',
  jd: 'PDF, DOCX or TXT',
  bulk: 'PDF or DOCX — multiple files supported',
};

export interface FileDropProps {
  accept: 'cv' | 'jd' | 'bulk';
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export function FileDrop({ accept, multiple, onFiles, hint, disabled, className }: FileDropProps) {
  const isMultiple = multiple ?? accept === 'bulk';

  const onDrop = React.useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT_MAP[accept],
    multiple: isMultiple,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-10 text-center transition-colors hover:border-muted-foreground/50 hover:bg-muted/50',
        isDragActive && 'border-primary bg-primary/5',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <input {...getInputProps()} />
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors',
          isDragActive && 'bg-primary/10 text-primary',
        )}
      >
        <Upload className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">
        {isDragActive
          ? 'Drop the file' + (isMultiple ? 's' : '') + ' here'
          : `Drag & drop ${isMultiple ? 'files' : 'a file'} here, or click to browse`}
      </p>
      <p className="text-xs text-muted-foreground">{hint ?? HINT_MAP[accept]}</p>
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { JdDto } from '@mfd/shared';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

function jdSummary(jd: JdDto): string | null {
  const p = jd.parsedCriteria;
  if (!p) return null;
  const parts = [
    `${p.requiredSkills.length} skills`,
    p.minYearsExperience !== null || p.maxYearsExperience !== null
      ? `${p.minYearsExperience ?? '?'}–${p.maxYearsExperience ?? '?'} yrs`
      : null,
    p.location,
    p.workMode !== 'unspecified' ? p.workMode : null,
    p.domain,
  ].filter(Boolean);
  return parts.join(' · ');
}

export interface JdPickerProps {
  value?: string;
  onChange: (jdId: string) => void;
  placeholder?: string;
}

/** JD select fed by GET /jds, with a parsed-criteria summary line for the selection. */
export function JdPicker({ value, onChange, placeholder }: JdPickerProps) {
  const { data: jds, isLoading } = useQuery({
    queryKey: ['jds'],
    queryFn: () => api.get<JdDto[]>('/jds'),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (!jds || jds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No job descriptions yet —{' '}
        <Link href="/jds" className="font-medium text-foreground underline underline-offset-4">
          add one first
        </Link>
        .
      </p>
    );
  }

  const selected = jds.find((jd) => jd.id === value);
  const summary = selected ? jdSummary(selected) : null;

  return (
    <div className="space-y-2">
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger className="w-full max-w-md">
          <SelectValue placeholder={placeholder ?? 'Select a job description…'} />
        </SelectTrigger>
        <SelectContent>
          {jds.map((jd) => (
            <SelectItem key={jd.id} value={jd.id}>
              {jd.title} — {jd.clientName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selected.clientName}</span>
          {summary ? <> · {summary}</> : <> · parsing pending</>}
        </p>
      )}
    </div>
  );
}

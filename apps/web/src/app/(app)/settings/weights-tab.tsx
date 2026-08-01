'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from '@mfd/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

import { apiPut } from './put';

const FIELDS: Array<{ key: keyof ScoreWeights; label: string; description: string }> = [
  {
    key: 'skills',
    label: 'Skills',
    description: 'Matched, partial and missing JD skills, tiered by the strength of CV evidence.',
  },
  {
    key: 'experience',
    label: 'Experience',
    description: 'Years of experience against the JD range, plus domain match and role similarity.',
  },
  {
    key: 'keywords',
    label: 'Keywords',
    description: "ATS keyword coverage of the JD's ranked terms — exact and semantic matches.",
  },
  {
    key: 'education',
    label: 'Education',
    description: 'Degree and certification requirements stated in the JD.',
  },
  {
    key: 'atsHealth',
    label: 'ATS format',
    description: 'CV structure and formatting health checks — parseability, sections, dates.',
  },
];

export function WeightsTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<ScoreWeights | null>(null);

  const { data: weights, isLoading } = useQuery({
    queryKey: ['settings-weights'],
    queryFn: () => api.get<ScoreWeights>('/settings/weights'),
  });

  React.useEffect(() => {
    if (weights) setForm((prev) => prev ?? { ...weights });
  }, [weights]);

  const saveMutation = useMutation({
    mutationFn: (next: ScoreWeights) => apiPut<ScoreWeights>('/settings/weights', next),
    onSuccess: (saved) => {
      toast.success('Scoring weights saved');
      setForm({ ...saved });
      void queryClient.invalidateQueries({ queryKey: ['settings-weights'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save weights');
    },
  });

  const sum = form
    ? Math.round(
        FIELDS.reduce((acc, f) => acc + (Number.isFinite(form[f.key]) ? form[f.key] : 0), 0) * 100,
      ) / 100
    : 0;
  const sumOk = sum === 100;

  const setField = (key: keyof ScoreWeights, raw: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: raw === '' ? 0 : Number(raw) } : prev));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring Weights</CardTitle>
        <CardDescription>
          How much each dimension contributes to the 0–100 match score. Weights must sum to 100.
          {!isAdmin && ' Read-only — managed by administrators.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading || !form ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`weight-${field.key}`} className="text-sm font-medium">
                      {field.label}
                    </Label>
                    <p className="mt-0.5 text-sm text-muted-foreground">{field.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`weight-${field.key}`}
                      type="number"
                      min={0}
                      max={100}
                      value={form[field.key]}
                      onChange={(e) => setField(field.key, e.target.value)}
                      disabled={!isAdmin}
                      className="w-24 text-right tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <p
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  sumOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                )}
              >
                Total: {sum}%{sumOk ? '' : ' — must equal 100%'}
              </p>
              {isAdmin && (
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setForm({ ...DEFAULT_SCORE_WEIGHTS })}
                    disabled={saveMutation.isPending}
                  >
                    <RotateCcw />
                    Reset to defaults
                  </Button>
                  <Button
                    onClick={() => form && saveMutation.mutate(form)}
                    disabled={!sumOk || saveMutation.isPending}
                  >
                    {saveMutation.isPending && <Loader2 className="animate-spin" />}
                    Save weights
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

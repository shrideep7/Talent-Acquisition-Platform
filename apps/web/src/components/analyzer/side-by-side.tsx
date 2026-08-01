'use client';

import * as React from 'react';
import type { MatchBreakdown } from '@mfd/shared';
import { Columns2 } from 'lucide-react';

import { HighlightedText, type HighlightKeyword } from '@/components/analyzer/highlighted-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface SideBySideViewProps {
  jdText: string | undefined;
  jdLoading: boolean;
  cvText: string | undefined;
  cvLoading: boolean;
  breakdown: MatchBreakdown;
}

interface Chip {
  term: string;
  label: string;
  kind: HighlightKeyword['kind'];
}

const CHIP_CLASS: Record<HighlightKeyword['kind'], string> = {
  match: 'kw-match',
  partial: 'kw-partial',
  missing: 'kw-missing',
};

function PaneSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i % 3 === 0 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

export function SideBySideView({ jdText, jdLoading, cvText, cvLoading, breakdown }: SideBySideViewProps) {
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const activeTerm = hovered ?? pinned;

  const { keywords } = breakdown;

  const chips = React.useMemo<Chip[]>(
    () => [
      ...keywords.exactMatches.map((t) => ({ term: t, label: t, kind: 'match' as const })),
      ...keywords.semanticMatches.map((m) => ({
        term: m.jdTerm,
        label: `${m.jdTerm} ≈ ${m.cvTerm}`,
        kind: 'partial' as const,
      })),
      ...keywords.missing.map((t) => ({ term: t, label: t, kind: 'missing' as const })),
    ],
    [keywords],
  );

  const jdKeywords = React.useMemo<HighlightKeyword[]>(
    () => [
      ...keywords.exactMatches.map((t) => ({ term: t, kind: 'match' as const })),
      ...keywords.semanticMatches.map((m) => ({ term: m.jdTerm, kind: 'partial' as const })),
      ...keywords.missing.map((t) => ({ term: t, kind: 'missing' as const })),
    ],
    [keywords],
  );

  const cvKeywords = React.useMemo<HighlightKeyword[]>(
    () => [
      ...keywords.exactMatches.map((t) => ({ term: t, kind: 'match' as const })),
      // Identity stays the JD term so one chip lights up both panes; the CV
      // wording is matched via alias.
      ...keywords.semanticMatches.map((m) => ({
        term: m.jdTerm,
        kind: 'partial' as const,
        aliases: [m.cvTerm],
      })),
    ],
    [keywords],
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Columns2 className="h-4 w-4 text-muted-foreground" />
          Side-by-side view
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="kw-match px-1.5">keyword</span> exact match
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="kw-partial px-1.5">keyword</span> semantic match
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="kw-missing px-1.5">keyword</span> missing from CV
          </span>
          <span className="ml-auto hidden sm:inline">
            Hover a chip to preview, click to pin highlights in both panes.
          </span>
        </div>

        {/* Interactive chips */}
        <div className="flex flex-wrap gap-1.5">
          {chips.length === 0 ? (
            <span className="text-sm text-muted-foreground">No keywords extracted.</span>
          ) : (
            chips.map((chip) => (
              <button
                key={`${chip.kind}:${chip.term}`}
                type="button"
                onClick={() => setPinned((cur) => (cur === chip.term ? null : chip.term))}
                onMouseEnter={() => setHovered(chip.term)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium transition-shadow',
                  CHIP_CLASS[chip.kind],
                  activeTerm === chip.term && 'kw-active',
                  pinned === chip.term && 'ring-2 ring-blue-500',
                )}
                aria-pressed={pinned === chip.term}
              >
                {chip.label}
              </button>
            ))
          )}
        </div>

        {/* Panes */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Job description
            </p>
            <ScrollArea className="h-[480px] rounded-md border bg-muted/20">
              {jdLoading ? (
                <PaneSkeleton />
              ) : jdText ? (
                <HighlightedText
                  text={jdText}
                  keywords={jdKeywords}
                  activeTerm={activeTerm}
                  className="p-4"
                />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">JD text unavailable.</p>
              )}
            </ScrollArea>
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Candidate CV
            </p>
            <ScrollArea className="h-[480px] rounded-md border bg-muted/20">
              {cvLoading ? (
                <PaneSkeleton />
              ) : cvText ? (
                <HighlightedText
                  text={cvText}
                  keywords={cvKeywords}
                  activeTerm={activeTerm}
                  className="p-4"
                />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">CV text unavailable.</p>
              )}
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

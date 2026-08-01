'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export interface HighlightKeyword {
  /** Canonical identity of the keyword (used for activeTerm matching). */
  term: string;
  kind: 'match' | 'missing' | 'partial';
  /** Extra surface forms that highlight as this keyword (e.g. the CV wording of a semantic match). */
  aliases?: string[];
}

export interface HighlightedTextProps {
  text: string;
  keywords: HighlightKeyword[];
  /** When set, occurrences of this keyword (by .term identity) pulse with a ring. */
  activeTerm?: string | null;
  className?: string;
}

const KIND_CLASS: Record<HighlightKeyword['kind'], string> = {
  match: 'kw-match',
  missing: 'kw-missing',
  partial: 'kw-partial',
};

interface Segment {
  text: string;
  kw: HighlightKeyword | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch);
}

/**
 * Renders text with case-insensitive keyword highlighting. Longer variants win
 * over shorter ones, and matches inside larger words are skipped ("Java" does
 * not highlight inside "JavaScript"). Segmentation is memoized so hover/click
 * activeTerm changes only re-render marks.
 */
export function HighlightedText({ text, keywords, activeTerm, className }: HighlightedTextProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const segments = React.useMemo<Segment[]>(() => {
    if (!text) return [];
    const variantMap = new Map<string, HighlightKeyword>();
    for (const kw of keywords) {
      for (const variant of [kw.term, ...(kw.aliases ?? [])]) {
        const key = variant.trim().toLowerCase();
        if (key.length > 0 && !variantMap.has(key)) variantMap.set(key, kw);
      }
    }
    if (variantMap.size === 0) return [{ text, kw: null }];

    // Longest-first so alternation prefers the most specific term.
    const variants = Array.from(variantMap.keys()).sort((a, b) => b.length - a.length);
    const pattern = new RegExp(variants.map(escapeRegExp).join('|'), 'gi');

    const out: Segment[] = [];
    let last = 0;
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const start = match.index ?? 0;
      const matched = match[0];
      const end = start + matched.length;
      // Word-ish boundaries: only enforced on edges that are themselves alphanumeric,
      // so terms like "CI/CD" or "C++" still match next to punctuation.
      if (isWordChar(matched[0]) && isWordChar(text[start - 1])) continue;
      if (isWordChar(matched[matched.length - 1]) && isWordChar(text[end])) continue;
      const kw = variantMap.get(matched.toLowerCase());
      if (!kw) continue;
      if (start > last) out.push({ text: text.slice(last, start), kw: null });
      out.push({ text: matched, kw });
      last = end;
    }
    if (last < text.length) out.push({ text: text.slice(last), kw: null });
    return out;
  }, [text, keywords]);

  // Bring the first active occurrence into view inside the scroll pane.
  React.useEffect(() => {
    if (!activeTerm || !containerRef.current) return;
    const el = containerRef.current.querySelector('mark.kw-active');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeTerm]);

  return (
    <div ref={containerRef} className={cn('whitespace-pre-wrap text-sm leading-relaxed', className)}>
      {segments.map((segment, i) =>
        segment.kw ? (
          <mark
            key={i}
            className={cn(
              KIND_CLASS[segment.kw.kind],
              activeTerm != null && segment.kw.term === activeTerm && 'kw-active animate-pulse',
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{segment.text}</React.Fragment>
        ),
      )}
    </div>
  );
}

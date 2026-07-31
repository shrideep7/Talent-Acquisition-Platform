'use client';

import * as React from 'react';

import { cn, scoreColor } from '@/lib/utils';

export interface ScoreDialProps {
  /** 0-100 */
  score: number;
  /** Diameter in px. Default 120. */
  size?: number;
  label?: string;
  className?: string;
}

/**
 * Circular SVG gauge for a 0-100 match score. Color follows the shared
 * scoreColor() thresholds: emerald >= 80, amber >= 60, red below.
 */
export function ScoreDial({ score, size = 120, label, className }: ScoreDialProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const strokeWidth = Math.max(6, size / 14);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * (1 - clamped / 100);

  // Animate from empty to the target on mount / score change.
  const [offset, setOffset] = React.useState(circumference);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setOffset(targetOffset));
    return () => cancelAnimationFrame(frame);
  }, [targetOffset]);

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-1', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label ?? 'Score'}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn('transition-[stroke-dashoffset] duration-700 ease-out', scoreColor(clamped))}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn('font-bold tabular-nums leading-none', scoreColor(clamped))}
            style={{ fontSize: size / 3.6 }}
          >
            {Math.round(clamped)}
          </span>
        </div>
      </div>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
    </div>
  );
}

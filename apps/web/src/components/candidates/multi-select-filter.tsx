'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { FacetCount } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiSelectFilterProps {
  label: string;
  options: FacetCount[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Render an option value for display (e.g. humanize enum names). */
  formatOption?: (value: string) => string;
  /** Show the search box (for long lists like skills/locations). */
  searchable?: boolean;
  emptyText?: string;
  className?: string;
}

/**
 * Faceted multi-select for the candidate filter bar: popover with a
 * checkbox list, per-option counts, and an optional search box.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  formatOption = (v) => v,
  searchable = false,
  emptyText = 'No options.',
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selectedSet = React.useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => formatOption(o.value).toLowerCase().includes(q));
  }, [options, query, formatOption]);

  const toggle = (value: string) => {
    if (selectedSet.has(value.toLowerCase())) {
      onChange(selected.filter((s) => s.toLowerCase() !== value.toLowerCase()));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 border-dashed', selected.length > 0 && 'border-solid', className)}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 rounded-sm px-1.5 font-normal">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {searchable && (
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="h-8 pl-8"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((option) => {
              const active = selectedSet.has(option.value.toLowerCase());
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary',
                      active ? 'bg-primary text-primary-foreground' : 'opacity-50',
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{formatOption(option.value)}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-center text-xs"
              onClick={() => onChange([])}
            >
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

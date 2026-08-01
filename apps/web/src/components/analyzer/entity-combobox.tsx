'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface EntityComboboxProps<T> {
  items: T[] | undefined;
  isLoading?: boolean;
  /** Currently selected item key (or null). */
  value: string | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => string;
  /** Text used for filtering and for the trigger label. */
  getLabel: (item: T) => string;
  /** Secondary line rendered under the label in the list. */
  getSublabel?: (item: T) => string | null;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

/** Searchable select built on Popover — filters client-side on the label. */
export function EntityCombobox<T>({
  items,
  isLoading,
  value,
  onSelect,
  getKey,
  getLabel,
  getSublabel,
  placeholder,
  searchPlaceholder = 'Search…',
  emptyText = 'No results found.',
  disabled,
}: EntityComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = React.useMemo(
    () => (value ? items?.find((item) => getKey(item) === value) : undefined),
    [items, value, getKey],
  );

  const filtered = React.useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        getLabel(item).toLowerCase().includes(q) ||
        (getSublabel?.(item) ?? '').toLowerCase().includes(q),
    );
  }, [items, query, getLabel, getSublabel]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected ? getLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-5 w-3/5" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((item) => {
              const key = getKey(item);
              const sub = getSublabel?.(item);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Check
                    className={cn('mt-0.5 h-4 w-4 shrink-0', key === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{getLabel(item)}</span>
                    {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

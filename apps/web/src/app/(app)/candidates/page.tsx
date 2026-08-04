'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, BookmarkPlus, Search, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CandidateDto, CandidateFacetsDto } from '@mfd/shared';

import { AddCandidateDialog } from '@/components/candidates/add-candidate-dialog';
import { ConsentBadge, SourceBadge } from '@/components/candidates/candidate-badges';
import { MultiSelectFilter } from '@/components/candidates/multi-select-filter';
import { humanizeStage } from '@/components/sourcing/stages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface Filters {
  search: string;
  skills: string[];
  skillMode: 'any' | 'all';
  locations: string[];
  sources: string[];
  consent: string[];
  stages: string[];
  minExp: string;
  maxExp: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  skills: [],
  skillMode: 'any',
  locations: [],
  sources: [],
  consent: [],
  stages: [],
  minExp: '',
  maxExp: '',
};

function countActive(f: Filters): number {
  return (
    (f.search.trim() ? 1 : 0) +
    f.skills.length +
    f.locations.length +
    f.sources.length +
    f.consent.length +
    f.stages.length +
    (f.minExp !== '' || f.maxExp !== '' ? 1 : 0)
  );
}

function buildQueryString(f: Filters): string {
  const params = new URLSearchParams();
  if (f.search.trim()) params.set('search', f.search.trim());
  f.skills.forEach((s) => params.append('skills', s));
  if (f.skills.length > 0) params.set('skillMode', f.skillMode);
  f.locations.forEach((l) => params.append('locations', l));
  f.sources.forEach((s) => params.append('sources', s));
  f.consent.forEach((c) => params.append('consent', c));
  f.stages.forEach((s) => params.append('stages', s));
  if (f.minExp !== '') params.set('minExperience', f.minExp);
  if (f.maxExp !== '') params.set('maxExperience', f.maxExp);
  return params.toString();
}

// ---------------------------------------------------------------------------
// Saved segments (named filter sets, stored per browser)
// ---------------------------------------------------------------------------

interface SavedSegment {
  name: string;
  filters: Filters;
}

const SEGMENTS_KEY = 'mfd.candidateSegments';

function loadSegments(): SavedSegment[] {
  try {
    const raw = localStorage.getItem(SEGMENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedSegment[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeSegments(segments: SavedSegment[]): void {
  try {
    localStorage.setItem(SEGMENTS_KEY, JSON.stringify(segments));
  } catch {
    // Storage full/unavailable — segments simply don't persist.
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CandidatesPage() {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  // Debounce the text/number inputs so typing doesn't fire a query per key.
  const [debouncedQs, setDebouncedQs] = React.useState('');
  const qs = buildQueryString(filters);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQs(qs), 300);
    return () => clearTimeout(timer);
  }, [qs]);

  const facetsQuery = useQuery({
    queryKey: ['candidate-facets'],
    queryFn: () => api.get<CandidateFacetsDto>('/candidates/facets'),
  });
  const facets = facetsQuery.data;

  const candidatesQuery = useQuery({
    queryKey: ['candidates', debouncedQs],
    queryFn: () =>
      api.get<CandidateDto[]>(`/candidates${debouncedQs ? `?${debouncedQs}` : ''}`),
  });
  const candidates = candidatesQuery.data ?? [];

  const activeCount = countActive(filters);

  // --- Saved segments ---------------------------------------------------
  const [segments, setSegments] = React.useState<SavedSegment[]>([]);
  React.useEffect(() => setSegments(loadSegments()), []);

  const [saveOpen, setSaveOpen] = React.useState(false);
  const [segmentName, setSegmentName] = React.useState('');

  const saveSegment = () => {
    const name = segmentName.trim();
    if (!name) return;
    const next = [...segments.filter((s) => s.name !== name), { name, filters }];
    setSegments(next);
    storeSegments(next);
    setSaveOpen(false);
    setSegmentName('');
    toast.success(`Segment "${name}" saved`);
  };

  const deleteSegment = (name: string) => {
    const next = segments.filter((s) => s.name !== name);
    setSegments(next);
    storeSegments(next);
  };

  const applySegment = (segment: SavedSegment) => {
    setFilters({ ...EMPTY_FILTERS, ...segment.filters });
    toast.success(`Segment "${segment.name}" applied`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground">
            The candidate pool — filter by skills, experience, location and pipeline stage to build
            segments.
          </p>
        </div>
        {!isViewer && <AddCandidateDialog />}
      </div>

      {/* ------------------------------------------------------ Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or title…"
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
              className="h-8 pl-9"
            />
          </div>

          <MultiSelectFilter
            label="Skills"
            options={facets?.skills ?? []}
            selected={filters.skills}
            onChange={(v) => set('skills', v)}
            searchable
            emptyText="No skills found in parsed CVs."
          />
          {filters.skills.length > 1 && (
            <div className="flex items-center overflow-hidden rounded-md border text-xs">
              {(['any', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('skillMode', mode)}
                  className={
                    filters.skillMode === mode
                      ? 'bg-primary px-2.5 py-1.5 font-medium text-primary-foreground'
                      : 'px-2.5 py-1.5 text-muted-foreground hover:bg-accent'
                  }
                >
                  {mode === 'any' ? 'Any' : 'All'}
                </button>
              ))}
            </div>
          )}

          <MultiSelectFilter
            label="Location"
            options={facets?.locations ?? []}
            selected={filters.locations}
            onChange={(v) => set('locations', v)}
            searchable
            emptyText="No locations on candidate profiles."
          />
          <MultiSelectFilter
            label="Stage"
            options={facets?.stages ?? []}
            selected={filters.stages}
            onChange={(v) => set('stages', v)}
            formatOption={humanizeStage}
            emptyText="No candidates in any pipeline yet."
          />
          <MultiSelectFilter
            label="Source"
            options={facets?.sources ?? []}
            selected={filters.sources}
            onChange={(v) => set('sources', v)}
            formatOption={humanizeStage}
          />
          <MultiSelectFilter
            label="Consent"
            options={facets?.consentStatuses ?? []}
            selected={filters.consent}
            onChange={(v) => set('consent', v)}
            formatOption={humanizeStage}
          />

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input
              type="number"
              min={0}
              placeholder={facets?.experience.min !== null && facets ? `${facets.experience.min}` : 'Min'}
              value={filters.minExp}
              onChange={(e) => set('minExp', e.target.value)}
              className="h-8 w-16"
              aria-label="Minimum years of experience"
            />
            <span>–</span>
            <Input
              type="number"
              min={0}
              placeholder={facets?.experience.max !== null && facets ? `${facets.experience.max}` : 'Max'}
              value={filters.maxExp}
              onChange={(e) => set('maxExp', e.target.value)}
              className="h-8 w-16"
              aria-label="Maximum years of experience"
            />
            <span className="whitespace-nowrap">yrs exp</span>
          </div>

          {/* Segments menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Bookmark className="h-3.5 w-3.5" />
                Segments
                {segments.length > 0 && (
                  <Badge variant="secondary" className="ml-1 rounded-sm px-1.5 font-normal">
                    {segments.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Saved segments</DropdownMenuLabel>
              {segments.length === 0 ? (
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  Save the current filters as a named segment to reuse them.
                </p>
              ) : (
                segments.map((segment) => (
                  <DropdownMenuItem
                    key={segment.name}
                    onClick={() => applySegment(segment)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate">{segment.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {countActive(segment.filters)} filters
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete segment ${segment.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSegment(segment.name);
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={activeCount === 0} onClick={() => setSaveOpen(true)}>
                <BookmarkPlus className="h-4 w-4" />
                Save current filters…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.skills.map((skill) => (
              <FilterChip
                key={`skill-${skill}`}
                label={skill}
                onRemove={() => set('skills', filters.skills.filter((s) => s !== skill))}
              />
            ))}
            {filters.locations.map((loc) => (
              <FilterChip
                key={`loc-${loc}`}
                label={loc}
                onRemove={() => set('locations', filters.locations.filter((l) => l !== loc))}
              />
            ))}
            {filters.stages.map((stage) => (
              <FilterChip
                key={`stage-${stage}`}
                label={humanizeStage(stage)}
                onRemove={() => set('stages', filters.stages.filter((s) => s !== stage))}
              />
            ))}
            {filters.sources.map((source) => (
              <FilterChip
                key={`source-${source}`}
                label={humanizeStage(source)}
                onRemove={() => set('sources', filters.sources.filter((s) => s !== source))}
              />
            ))}
            {filters.consent.map((status) => (
              <FilterChip
                key={`consent-${status}`}
                label={`Consent: ${humanizeStage(status)}`}
                onRemove={() => set('consent', filters.consent.filter((c) => c !== status))}
              />
            ))}
            {(filters.minExp !== '' || filters.maxExp !== '') && (
              <FilterChip
                label={`${filters.minExp || '0'}–${filters.maxExp || '∞'} yrs`}
                onRemove={() => setFilters((f) => ({ ...f, minExp: '', maxExp: '' }))}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Result count */}
        {!candidatesQuery.isLoading && facets && (
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{candidates.length}</span> of{' '}
            {facets.total} candidates
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Current title</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead className="text-center">Experience (yrs)</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Notice</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Consent</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidatesQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-36 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Users className="h-8 w-8" />
                      <p className="text-sm">
                        {activeCount > 0
                          ? 'No candidates match the current filters.'
                          : 'No candidates yet. Upload a CV to add the first one.'}
                      </p>
                      {activeCount > 0 ? (
                        <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                          Clear filters
                        </Button>
                      ) : (
                        !isViewer && (
                          <AddCandidateDialog
                            trigger={<Button variant="outline">Add Candidate</Button>}
                          />
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="max-w-[13rem] font-medium">
                      <Link
                        href={`/candidates/${candidate.id}`}
                        className="block truncate hover:underline"
                      >
                        {candidate.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                      {candidate.currentTitle ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <SkillChips skills={candidate.skills ?? []} highlighted={filters.skills} />
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {candidate.totalYearsExperience ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {candidate.currentLocation ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {candidate.noticePeriod ?? '—'}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={candidate.source} />
                    </TableCell>
                    <TableCell>
                      <ConsentBadge status={candidate.consentStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(candidate.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ Save segment dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save segment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveSegment()}
              placeholder='e.g. "Informatica · Pune · 5-8 yrs"'
            />
            <p className="text-xs text-muted-foreground">
              Saves the current {countActive(filters)} filter{countActive(filters) === 1 ? '' : 's'}{' '}
              as a reusable segment (stored in this browser).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={segmentName.trim().length === 0} onClick={saveSegment}>
              Save segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 font-normal">
      {label}
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-background/60"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function SkillChips({ skills, highlighted }: { skills: string[]; highlighted: string[] }) {
  if (skills.length === 0) return <span className="text-muted-foreground">—</span>;

  // Selected skills first, so the recruiter sees why the row matched.
  const highlightSet = new Set(highlighted.map((s) => s.toLowerCase()));
  const ordered = [...skills].sort((a, b) => {
    const aHit = highlightSet.has(a.toLowerCase()) ? 0 : 1;
    const bHit = highlightSet.has(b.toLowerCase()) ? 0 : 1;
    return aHit - bHit;
  });
  const shown = ordered.slice(0, 3);
  const more = ordered.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((skill) => (
        <Badge
          key={skill}
          variant={highlightSet.has(skill.toLowerCase()) ? 'default' : 'secondary'}
          className="max-w-[9rem] truncate font-normal"
        >
          {skill}
        </Badge>
      ))}
      {more > 0 && (
        <span className="text-xs text-muted-foreground" title={ordered.slice(3).join(', ')}>
          +{more}
        </span>
      )}
    </div>
  );
}

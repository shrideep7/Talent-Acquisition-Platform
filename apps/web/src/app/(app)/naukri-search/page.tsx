'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { JdDto, NaukriSearchCriteria, NaukriSearchDto } from '@mfd/shared';
import {
  Briefcase,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  GraduationCap,
  IndianRupee,
  Lightbulb,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Timer,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/analyzer/entity-combobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Clipboard helpers
// ---------------------------------------------------------------------------

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http:// origins don't expose navigator.clipboard — fall back.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

function CopyButton({
  text,
  label,
  size = 'sm',
  variant = 'outline',
  className,
}: {
  text: string;
  label?: string;
  size?: 'sm' | 'icon';
  variant?: 'outline' | 'ghost' | 'default';
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('shrink-0', className)}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } else {
          toast.error('Could not access the clipboard — copy manually');
        }
      }}
    >
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
      {size !== 'icon' && (copied ? 'Copied' : (label ?? 'Copy'))}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatExperience(c: NaukriSearchCriteria): string | null {
  if (c.minExperienceYears === null && c.maxExperienceYears === null) return null;
  if (c.minExperienceYears !== null && c.maxExperienceYears !== null) {
    return `${c.minExperienceYears} – ${c.maxExperienceYears} years`;
  }
  if (c.minExperienceYears !== null) return `${c.minExperienceYears}+ years`;
  return `Up to ${c.maxExperienceYears} years`;
}

function formatSalary(c: NaukriSearchCriteria): string | null {
  if (c.minAnnualSalaryLakhs === null && c.maxAnnualSalaryLakhs === null) return null;
  if (c.minAnnualSalaryLakhs !== null && c.maxAnnualSalaryLakhs !== null) {
    return `₹${c.minAnnualSalaryLakhs} – ${c.maxAnnualSalaryLakhs} lakhs`;
  }
  if (c.minAnnualSalaryLakhs !== null) return `₹${c.minAnnualSalaryLakhs}+ lakhs`;
  return `Up to ₹${c.maxAnnualSalaryLakhs} lakhs`;
}

/** Plain-text dump of every filter, for the "Copy all" button. */
function formatAll(c: NaukriSearchCriteria): string {
  const lines: string[] = [];
  lines.push(`Keywords (boolean): ${c.booleanKeywords}`);
  if (c.mustHaveKeywords.length) lines.push(`Must-have: ${c.mustHaveKeywords.join(', ')}`);
  if (c.optionalKeywords.length) lines.push(`Good-to-have: ${c.optionalKeywords.join(', ')}`);
  if (c.excludeKeywords.length) lines.push(`Exclude: ${c.excludeKeywords.join(', ')}`);
  if (c.itSkills.length) lines.push(`IT skills: ${c.itSkills.join(', ')}`);
  const exp = formatExperience(c);
  if (exp) lines.push(`Experience: ${exp}`);
  if (c.currentLocations.length) lines.push(`Current location: ${c.currentLocations.join(', ')}`);
  const sal = formatSalary(c);
  if (sal) lines.push(`Annual salary: ${sal}${c.salaryNote ? ` (${c.salaryNote})` : ''}`);
  if (c.noticePeriod) lines.push(`Notice period: ${c.noticePeriod}`);
  if (c.designations.length) lines.push(`Designations: ${c.designations.join(', ')}`);
  if (c.education.length) lines.push(`Education: ${c.education.join(', ')}`);
  if (c.industry) lines.push(`Industry: ${c.industry}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Result building blocks
// ---------------------------------------------------------------------------

function BadgeList({
  items,
  variant = 'secondary',
  className,
}: {
  items: string[];
  variant?: 'secondary' | 'outline' | 'destructive';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item) => (
        <Badge key={item} variant={variant} className="font-normal">
          {item}
        </Badge>
      ))}
    </div>
  );
}

/** One Resdex filter: label row with a copy button, then the value. */
function FilterRow({
  icon: Icon,
  label,
  copyValue,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  copyValue: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </span>
        {copyValue && <CopyButton text={copyValue} size="icon" variant="ghost" className="h-7 w-7" />}
      </div>
      {children}
    </div>
  );
}

function Empty({ label = 'Not specified' }: { label?: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

function ResultView({ result }: { result: NaukriSearchDto }) {
  const c = result.criteria;
  const experience = formatExperience(c);
  const salary = formatSalary(c);

  return (
    <div className="space-y-6">
      {/* Keywords — the field recruiters paste first */}
      <Card className="border-primary/40">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" />
            Keywords
            <Badge variant="secondary" className="font-normal">Resdex search box</Badge>
          </CardTitle>
          <CopyButton text={c.booleanKeywords} label="Copy keywords" variant="default" />
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 font-mono text-sm leading-relaxed">
            {c.booleanKeywords}
          </pre>
          <div className="grid gap-4 md:grid-cols-3">
            <FilterRow
              icon={Check}
              label={`Must-have (${c.mustHaveKeywords.length})`}
              copyValue={c.mustHaveKeywords.length ? c.mustHaveKeywords.join(', ') : null}
            >
              {c.mustHaveKeywords.length ? <BadgeList items={c.mustHaveKeywords} /> : <Empty />}
            </FilterRow>
            <FilterRow
              icon={Lightbulb}
              label={`Good-to-have (${c.optionalKeywords.length})`}
              copyValue={c.optionalKeywords.length ? c.optionalKeywords.join(', ') : null}
            >
              {c.optionalKeywords.length ? (
                <BadgeList items={c.optionalKeywords} variant="outline" />
              ) : (
                <Empty />
              )}
            </FilterRow>
            <FilterRow
              icon={Search}
              label={`Exclude — NOT (${c.excludeKeywords.length})`}
              copyValue={c.excludeKeywords.length ? c.excludeKeywords.join(', ') : null}
            >
              {c.excludeKeywords.length ? (
                <BadgeList items={c.excludeKeywords} variant="destructive" />
              ) : (
                <Empty label="None suggested" />
              )}
            </FilterRow>
          </div>
        </CardContent>
      </Card>

      {/* The other three mandatory Resdex filters */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <FilterRow icon={Timer} label="Experience" copyValue={experience}>
              {experience ? (
                <p className="text-xl font-semibold">{experience}</p>
              ) : (
                <Empty label="Not stated in the JD" />
              )}
            </FilterRow>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FilterRow
              icon={MapPin}
              label="Current location of candidate"
              copyValue={c.currentLocations.length ? c.currentLocations.join(', ') : null}
            >
              {c.currentLocations.length ? <BadgeList items={c.currentLocations} /> : <Empty />}
            </FilterRow>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FilterRow icon={IndianRupee} label="Annual salary" copyValue={salary}>
              {salary ? (
                <>
                  <p className="text-xl font-semibold">
                    {salary} <span className="text-sm font-normal text-muted-foreground">per annum</span>
                  </p>
                  {c.salaryNote && <p className="text-xs text-muted-foreground">{c.salaryNote}</p>}
                </>
              ) : (
                <Empty label="Not stated in the JD" />
              )}
            </FilterRow>
          </CardContent>
        </Card>
      </div>

      {/* Additional Resdex filters worth setting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            More filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FilterRow
            icon={Wrench}
            label="IT skills"
            copyValue={c.itSkills.length ? c.itSkills.join(', ') : null}
          >
            {c.itSkills.length ? <BadgeList items={c.itSkills} /> : <Empty />}
          </FilterRow>
          <FilterRow
            icon={Briefcase}
            label="Designations to search"
            copyValue={c.designations.length ? c.designations.join(', ') : null}
          >
            {c.designations.length ? <BadgeList items={c.designations} variant="outline" /> : <Empty />}
          </FilterRow>
          <FilterRow
            icon={GraduationCap}
            label="Education"
            copyValue={c.education.length ? c.education.join(', ') : null}
          >
            {c.education.length ? <BadgeList items={c.education} /> : <Empty label="No degree requirement" />}
          </FilterRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FilterRow icon={Timer} label="Notice period" copyValue={c.noticePeriod}>
              {c.noticePeriod ? <p className="text-sm">{c.noticePeriod}</p> : <Empty />}
            </FilterRow>
            <FilterRow icon={FileText} label="Industry" copyValue={c.industry}>
              {c.industry ? <p className="text-sm">{c.industry}</p> : <Empty />}
            </FilterRow>
          </div>
        </CardContent>
      </Card>

      {/* Search strategy */}
      {c.searchTips.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              Search tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {c.searchTips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NaukriSearchPage() {
  const { user } = useAuth();
  const canGenerate = user !== null && user.role !== 'VIEWER';

  const [mode, setMode] = React.useState<'jd' | 'paste'>('jd');
  const [jdId, setJdId] = React.useState<string | null>(null);
  const [rawText, setRawText] = React.useState('');
  const [result, setResult] = React.useState<NaukriSearchDto | null>(null);

  const { data: jds, isLoading: jdsLoading } = useQuery({
    queryKey: ['jds'],
    queryFn: () => api.get<JdDto[]>('/jds'),
  });
  const selectedJd = React.useMemo(
    () => (jdId ? jds?.find((jd) => jd.id === jdId) : undefined),
    [jds, jdId],
  );

  const extract = useMutation({
    mutationFn: (vars: { refresh?: boolean }) =>
      api.post<NaukriSearchDto>('/naukri-search', {
        ...(mode === 'jd' ? { jdId } : { rawText }),
        ...(vars.refresh ? { refresh: true } : {}),
      }),
    onSuccess: (data) => {
      setResult(data);
      toast.success(
        data.cached ? 'Search filters loaded (cached result)' : 'Search filters extracted from the JD',
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit =
    canGenerate &&
    !extract.isPending &&
    (mode === 'jd' ? jdId !== null : rawText.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Naukri Search</h1>
          <p className="text-muted-foreground">
            Turn a JD into ready-to-paste Naukri Resdex search filters — keywords, experience,
            location and salary.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="https://resdex.naukri.com" target="_blank" rel="noreferrer">
            <ExternalLink /> Open Resdex
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            Job Description
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'jd' | 'paste')}>
            <TabsList>
              <TabsTrigger value="jd">Saved JD</TabsTrigger>
              <TabsTrigger value="paste">Paste JD text</TabsTrigger>
            </TabsList>
            <TabsContent value="jd" className="mt-4 space-y-3">
              <EntityCombobox
                items={jds}
                isLoading={jdsLoading}
                value={jdId}
                onSelect={(jd) => setJdId(jd.id)}
                getKey={(jd) => jd.id}
                getLabel={(jd) => jd.title}
                getSublabel={(jd) => jd.clientName || null}
                placeholder="Select a job description…"
                searchPlaceholder="Search JDs by title…"
                emptyText="No JDs found. Upload one on the Analyzer or Job Descriptions page."
              />
              {selectedJd && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {selectedJd.clientName || 'No client'}
                  </span>
                  {selectedJd.parsedCriteria && (
                    <Badge variant="secondary">
                      {selectedJd.parsedCriteria.requiredSkills.length} skills parsed
                    </Badge>
                  )}
                  {selectedJd.fileName && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <FileText className="h-3 w-3" /> {selectedJd.fileName}
                    </span>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="paste" className="mt-4 space-y-1.5">
              <Label htmlFor="naukri-jd-text">JD text</Label>
              <Textarea
                id="naukri-jd-text"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                placeholder="Paste the full job description here — nothing is saved, it is only used to build the search"
              />
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!canSubmit} onClick={() => extract.mutate({})}>
              {extract.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Extracting filters…
                </>
              ) : (
                <>
                  <Search /> Extract search filters
                </>
              )}
            </Button>
            {result && !extract.isPending && (
              <>
                <Button variant="outline" onClick={() => extract.mutate({ refresh: true })}>
                  <RefreshCw /> Regenerate
                </Button>
                <CopyButton text={formatAll(result.criteria)} label="Copy all filters" />
              </>
            )}
            {!canGenerate && (
              <p className="text-sm text-muted-foreground">
                Viewers cannot run extractions — ask a recruiter or admin.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {result && !extract.isPending && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Resdex filters for{' '}
              <span className="font-medium text-foreground">{result.jdTitle ?? 'pasted JD'}</span>
            </span>
            {result.cached && <Badge variant="outline">cached — Regenerate to redo</Badge>}
          </div>
          <ResultView result={result} />
        </>
      )}
    </div>
  );
}

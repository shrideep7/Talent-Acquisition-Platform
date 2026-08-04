'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { PrescreenFormDto } from '@mfd/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type PageState = 'loading' | 'form' | 'closed' | 'missing' | 'done';

/**
 * Candidate-facing pre-screen response form — public, reached via the
 * unguessable token link in the pre-screening email. Deliberately free of
 * any recruiter UI: plain fetch, no auth, no app chrome.
 */
export default function PrescreenFormPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = React.useState<PageState>('loading');
  const [form, setForm] = React.useState<PrescreenFormDto | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [consent, setConsent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/prescreen-form/${token}`);
        if (res.status === 404) {
          if (!cancelled) setState('missing');
          return;
        }
        const data = (await res.json()) as PrescreenFormDto;
        if (cancelled) return;
        setForm(data);
        setState(data.status === 'INVITED' || data.status === 'IN_PROGRESS' ? 'form' : 'closed');
      } catch {
        if (!cancelled) setState('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/prescreen-form/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent, answers }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        throw new Error(
          Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Submission failed'),
        );
      }
      setState('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const answered = Object.values(answers).filter((v) => v.trim().length > 0).length;

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            M
          </span>
          MFD Talent
        </div>

        {state === 'loading' && (
          <Card>
            <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </CardContent>
          </Card>
        )}

        {state === 'missing' && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              This link is not valid. Please use the link from your email, or contact the recruiter
              who wrote to you.
            </CardContent>
          </Card>
        )}

        {state === 'closed' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="font-medium">This pre-screen is already complete.</p>
              <p className="text-sm text-muted-foreground">
                Thank you — our recruiter will be in touch.
              </p>
            </CardContent>
          </Card>
        )}

        {state === 'done' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="font-medium">Thank you{form ? `, ${form.candidateFirstName}` : ''}!</p>
              <p className="text-sm text-muted-foreground">
                Your answers have been recorded. Our recruiter will call you at your preferred time.
              </p>
            </CardContent>
          </Card>
        )}

        {state === 'form' && form && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {form.jdTitle}
                {form.clientName ? ` — ${form.clientName}` : ''}
              </CardTitle>
              <CardDescription>
                Hi {form.candidateFirstName}! Please answer these quick questions before our
                recruiter calls you — it takes about 2 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {form.questions.map((q, i) => (
                <div key={q.key} className="space-y-1.5">
                  <Label htmlFor={`q-${q.key}`} className="whitespace-pre-wrap leading-snug">
                    {i + 1}. {q.question}
                  </Label>
                  {q.kind === 'yes_no' ? (
                    <div className="flex gap-2">
                      {['Yes', 'No'].map((option) => (
                        <Button
                          key={option}
                          type="button"
                          size="sm"
                          variant={answers[q.key] === option ? 'default' : 'outline'}
                          onClick={() => setAnswers((a) => ({ ...a, [q.key]: option }))}
                        >
                          {option}
                        </Button>
                      ))}
                      <Input
                        placeholder="…or add details"
                        value={
                          answers[q.key] === 'Yes' || answers[q.key] === 'No'
                            ? ''
                            : (answers[q.key] ?? '')
                        }
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                        className="h-8 flex-1"
                      />
                    </div>
                  ) : q.key === 'reason_for_change' ? (
                    <Textarea
                      id={`q-${q.key}`}
                      rows={2}
                      value={answers[q.key] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`q-${q.key}`}
                      value={answers[q.key] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I agree that MFD Talent stores my answers securely and uses them only for this
                  hiring process.
                </span>
              </label>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                className="w-full"
                disabled={!consent || answered === 0 || submitting}
                onClick={submit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" /> Submitting…
                  </>
                ) : (
                  `Submit answers (${answered}/${form.questions.length} answered)`
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          MFD Talent · hiring@metafordata.com
        </p>
      </div>
    </div>
  );
}

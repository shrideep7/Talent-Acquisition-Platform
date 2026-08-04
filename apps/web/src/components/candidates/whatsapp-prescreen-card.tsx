'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  CandidateDto,
  JdDto,
  PreCallBrief,
  PrescreenChannel,
  ScreeningConversationDto,
  ScreeningConversationStatus,
} from '@mfd/shared';

import { EntityCombobox } from '@/components/analyzer/entity-combobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

const STATUS_LABELS: Record<ScreeningConversationStatus, string> = {
  INVITED: 'Invite sent',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DECLINED: 'Not interested',
  OPTED_OUT: 'Opted out',
  NEEDS_HUMAN: 'Needs human',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

const STATUS_STYLES: Record<ScreeningConversationStatus, string> = {
  INVITED: 'border-transparent bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  IN_PROGRESS:
    'border-transparent bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  COMPLETED:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  DECLINED: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  OPTED_OUT: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  NEEDS_HUMAN: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  EXPIRED: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  CANCELLED: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
};

const ACTIVE = new Set<ScreeningConversationStatus>(['INVITED', 'IN_PROGRESS']);

export function WhatsappPrescreenCard({
  candidate,
  isViewer,
}: {
  candidate: CandidateDto;
  isViewer: boolean;
}) {
  const queryClient = useQueryClient();
  const [startOpen, setStartOpen] = React.useState(false);
  const [viewId, setViewId] = React.useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => api.get<{ mode: 'simulated' | 'meta' }>('/whatsapp-screening/config'),
  });
  const simulated = configQuery.data?.mode === 'simulated';

  const listQuery = useQuery({
    queryKey: ['whatsapp-screening', candidate.id],
    queryFn: () =>
      api.get<ScreeningConversationDto[]>(`/whatsapp-screening?candidateId=${candidate.id}`),
  });
  const conversations = listQuery.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['whatsapp-screening', candidate.id] });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          Pre-Screen
          {simulated && (
            <Badge variant="outline" className="font-normal">
              WhatsApp: simulator
            </Badge>
          )}
        </CardTitle>
        {!isViewer && (
          <Button size="sm" variant="outline" onClick={() => setStartOpen(true)}>
            <Send className="h-3.5 w-3.5" />
            Start pre-screen
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pre-screens yet. Confirm interest, logistics (notice, CTC, location) and CV claims
            over WhatsApp or email before the human screening call.
          </p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => setViewId(conv.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {conv.channel === 'EMAIL' ? (
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{conv.jdTitle ?? 'JD'}</span>
              {conv.brief && conv.brief.flags.length > 0 && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              )}
              <Badge className={cn('shrink-0 shadow-none', STATUS_STYLES[conv.status])}>
                {STATUS_LABELS[conv.status]}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(conv.updatedAt)}
              </span>
            </button>
          ))
        )}
      </CardContent>

      <StartDialog
        candidate={candidate}
        open={startOpen}
        onOpenChange={setStartOpen}
        onStarted={(id) => {
          invalidate();
          setViewId(id);
        }}
      />
      {viewId && (
        <ConversationDialog
          conversationId={viewId}
          simulated={simulated}
          isViewer={isViewer}
          onOpenChange={(open) => {
            if (!open) {
              setViewId(null);
              invalidate();
            }
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Start dialog
// ---------------------------------------------------------------------------

function StartDialog({
  candidate,
  open,
  onOpenChange,
  onStarted,
}: {
  candidate: CandidateDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (conversationId: string) => void;
}) {
  const [channel, setChannel] = React.useState<PrescreenChannel>('EMAIL');
  const [jdId, setJdId] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');

  const { data: jds, isLoading } = useQuery({
    queryKey: ['jds'],
    queryFn: () => api.get<JdDto[]>('/jds'),
    enabled: open,
  });
  const { data: emailConfig } = useQuery({
    queryKey: ['email-prescreen-config'],
    queryFn: () => api.get<{ mode: 'smtp' | 'simulated' }>('/email-prescreen/config'),
    enabled: open,
  });

  const start = useMutation({
    mutationFn: () =>
      channel === 'EMAIL'
        ? api.post<ScreeningConversationDto>('/email-prescreen', {
            candidateId: candidate.id,
            jdId,
            ...(email.trim() ? { email: email.trim() } : {}),
          })
        : api.post<ScreeningConversationDto>('/whatsapp-screening', {
            candidateId: candidate.id,
            jdId,
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          }),
    onSuccess: (conv) => {
      toast.success(channel === 'EMAIL' ? 'Pre-screening email sent' : 'Pre-screen invite sent');
      onOpenChange(false);
      onStarted(conv.id);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const needsContact =
    channel === 'EMAIL'
      ? !candidate.email && email.trim().length === 0
      : !candidate.phone && phone.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start pre-screen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={channel === 'EMAIL' ? 'default' : 'outline'}
                onClick={() => setChannel('EMAIL')}
                className="justify-start"
              >
                <Mail className="h-4 w-4" />
                Email
                {emailConfig?.mode === 'simulated' && (
                  <span className="ml-auto text-[10px] opacity-70">simulated</span>
                )}
              </Button>
              <Button
                type="button"
                variant={channel === 'WHATSAPP' ? 'default' : 'outline'}
                onClick={() => setChannel('WHATSAPP')}
                className="justify-start"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Job description</Label>
            <EntityCombobox
              items={jds}
              isLoading={isLoading}
              value={jdId}
              onSelect={(jd) => setJdId(jd.id)}
              getKey={(jd) => jd.id}
              getLabel={(jd) => jd.title}
              getSublabel={(jd) => jd.clientName || null}
              placeholder="Select the JD this pre-screen is for…"
              searchPlaceholder="Search JDs…"
            />
          </div>
          {channel === 'WHATSAPP' ? (
            <div className="space-y-1.5">
              <Label htmlFor="prescreen-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                WhatsApp number {candidate.phone ? '(from CV — override if needed)' : '(required)'}
              </Label>
              <Input
                id="prescreen-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={candidate.phone ?? '+91XXXXXXXXXX'}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="prescreen-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Email address {candidate.email ? '(from CV — override if needed)' : '(required)'}
              </Label>
              <Input
                id="prescreen-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={candidate.email ?? 'candidate@example.com'}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {channel === 'EMAIL'
              ? 'Sends one concise email from hiring@metafordata.com with a secure answer-form link plus the questions inline (candidates can also just reply). Answers become a pre-call brief automatically.'
              : 'The invite explains who we are and asks for consent; the bot then walks through the questions one by one and books the human screening call.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!jdId || needsContact || start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {channel === 'EMAIL' ? 'Send email' : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Conversation viewer (+ simulator)
// ---------------------------------------------------------------------------

function ConversationDialog({
  conversationId,
  simulated,
  isViewer,
  onOpenChange,
}: {
  conversationId: string;
  simulated: boolean;
  isViewer: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reply, setReply] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['whatsapp-conversation', conversationId],
    queryFn: () => api.get<ScreeningConversationDto>(`/whatsapp-screening/${conversationId}`),
    // Replies arrive out-of-band (webhook / public form) — poll while open.
    refetchInterval: 5000,
  });
  const conv = query.data;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [conv?.transcript.length]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['whatsapp-conversation', conversationId] });

  const simulate = useMutation({
    mutationFn: (text: string) =>
      api.post<ScreeningConversationDto>(`/whatsapp-screening/${conversationId}/simulate-reply`, {
        text,
      }),
    onSuccess: () => {
      setReply('');
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/whatsapp-screening/${conversationId}/cancel`, {}),
    onSuccess: () => {
      toast.success('Pre-screen cancelled');
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replyText, setReplyText] = React.useState('');
  const recordReply = useMutation({
    mutationFn: () =>
      api.post<ScreeningConversationDto>(`/email-prescreen/${conversationId}/record-reply`, {
        text: replyText,
      }),
    onSuccess: () => {
      toast.success('Reply parsed — pre-call brief ready');
      setReplyOpen(false);
      setReplyText('');
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyFormLink = async () => {
    // Prefer the exact link the candidate received (may be a Google Form).
    const link =
      conv?.formUrl ??
      (conv?.formToken ? `${window.location.origin}/prescreen/${conv.formToken}` : null);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Form link copied');
    } catch {
      toast.error(`Could not copy — link: ${link}`);
    }
  };

  const active = conv ? ACTIVE.has(conv.status) : false;
  const isEmail = conv?.channel === 'EMAIL';

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            Pre-screen — {conv?.jdTitle ?? '…'}
            {conv && (
              <Badge className={cn('shadow-none', STATUS_STYLES[conv.status])}>
                {STATUS_LABELS[conv.status]}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" ref={scrollRef}>
          {/* Chat transcript */}
          <div className="space-y-2">
            {conv?.transcript.map((message, i) => (
              <div
                key={i}
                className={cn('flex', message.direction === 'out' ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                    message.direction === 'out'
                      ? 'bg-muted text-foreground'
                      : 'bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100',
                  )}
                >
                  {message.text}
                  <div className="mt-1 text-[10px] opacity-60">{formatDateTime(message.at)}</div>
                </div>
              </div>
            ))}
            {conv && conv.transcript.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
            )}
          </div>

          {/* Pre-call brief */}
          {conv?.brief && <BriefView brief={conv.brief} />}
        </div>

        {/* Simulator input / actions */}
        <div className="space-y-2 border-t pt-3">
          {isEmail && active && !isViewer && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copyFormLink}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy form link
                </Button>
                <Button variant="outline" size="sm" onClick={() => setReplyOpen((v) => !v)}>
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Record response…
                </Button>
              </div>
              {replyOpen && (
                <div className="space-y-1.5">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={5}
                    placeholder="Paste the candidate's email reply or their Google Form responses (copy the row from the linked Sheet) — it will be parsed against the questions"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={replyText.trim().length < 5 || recordReply.isPending}
                    onClick={() => recordReply.mutate()}
                  >
                    {recordReply.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <ClipboardPaste className="h-3.5 w-3.5" />
                    )}
                    Parse reply &amp; complete
                  </Button>
                </div>
              )}
            </div>
          )}
          {!isEmail && simulated && active && !isViewer && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Simulator — reply as the candidate would on WhatsApp
              </p>
              <div className="flex gap-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && reply.trim() && !simulate.isPending) {
                      simulate.mutate(reply.trim());
                    }
                  }}
                  placeholder='e.g. "YES", "60 days negotiable", "18 LPA"'
                />
                <Button
                  disabled={!reply.trim() || simulate.isPending}
                  onClick={() => simulate.mutate(reply.trim())}
                >
                  {simulate.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </div>
            </div>
          )}
          {active && !isViewer && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              <Ban className="h-3.5 w-3.5" />
              Cancel pre-screen
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pre-call brief
// ---------------------------------------------------------------------------

function BriefField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? '—'}</p>
    </div>
  );
}

function BriefView({ brief }: { brief: PreCallBrief }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        Pre-call brief
        {brief.interested === true && (
          <Badge className="border-transparent bg-emerald-100 text-emerald-900 shadow-none dark:bg-emerald-900/40 dark:text-emerald-200">
            Interested
          </Badge>
        )}
        {brief.interested === false && <Badge variant="secondary">Not interested</Badge>}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <BriefField
          label="Notice period"
          value={
            brief.noticePeriod
              ? `${brief.noticePeriod}${brief.noticePeriodDays !== null ? ` (~${brief.noticePeriodDays} days)` : ''}`
              : null
          }
        />
        <BriefField
          label="Current → expected CTC"
          value={
            brief.currentCtc || brief.expectedCtc
              ? `${brief.currentCtc ?? '—'} → ${brief.expectedCtc ?? '—'}`
              : null
          }
        />
        <BriefField
          label="Location"
          value={
            brief.location
              ? `${brief.location}${brief.locationWilling === false ? ' — NOT willing for role location' : ''}`
              : null
          }
        />
        <BriefField label="Offers in hand" value={brief.offersInHand} />
        <BriefField label="Reason for change" value={brief.reasonForChange} />
        <BriefField label="Call slot" value={brief.callSlot} />
      </div>

      {brief.claims.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CV claims checked
          </p>
          {brief.claims.map((claim, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {claim.confirmed === true ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : claim.confirmed === false ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <span>
                {claim.claim}
                {claim.note && <span className="text-muted-foreground"> — {claim.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {brief.flags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Review before the call
          </p>
          {brief.flags.map((flag, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}

      {brief.candidateQuestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Candidate asked
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {brief.candidateQuestions.map((question, i) => (
              <li key={i}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

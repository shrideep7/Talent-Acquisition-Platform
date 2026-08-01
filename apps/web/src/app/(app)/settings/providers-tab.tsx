'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

import { apiPut } from './put';

/** Shape of GET /settings/providers rows — verified against apps/api/src/settings/settings.service.ts (ProviderStatusDto). */
interface ProviderStatus {
  provider: string;
  configured: boolean;
  updatedAt: string;
}

const CREDENTIAL_FIELDS = [
  { key: 'clientId', label: 'Client ID' },
  { key: 'clientSecret', label: 'Client Secret' },
  { key: 'apiKey', label: 'API Key' },
  { key: 'username', label: 'Recruiter Username' },
  { key: 'password', label: 'Recruiter Password' },
] as const;

type CredentialKey = (typeof CREDENTIAL_FIELDS)[number]['key'];

const EMPTY_FORM: Record<CredentialKey, string> = {
  clientId: '',
  clientSecret: '',
  apiKey: '',
  username: '',
  password: '',
};

export function ProvidersTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<Record<CredentialKey, string>>({ ...EMPTY_FORM });

  const { data: providers, isLoading } = useQuery({
    queryKey: ['settings-providers'],
    queryFn: () => api.get<ProviderStatus[]>('/settings/providers'),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut<ProviderStatus>('/settings/providers/naukri_resdex', { credentials: form }),
    onSuccess: () => {
      toast.success('Naukri Resdex credentials saved');
      setForm({ ...EMPTY_FORM });
      void queryClient.invalidateQueries({ queryKey: ['settings-providers'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save credentials');
    },
  });

  const naukri = providers?.find((p) => p.provider === 'naukri_resdex');
  const formComplete = CREDENTIAL_FIELDS.every((f) => form[f.key].trim().length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sourcing Providers</CardTitle>
        <CardDescription>Third-party candidate sources for the Sourcing screen.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5 rounded-lg border p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Naukri Resdex</p>
              <p className="text-sm text-muted-foreground">
                Official Resdex API for direct candidate sourcing.
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-28" />
            ) : naukri ? (
              <div className="flex items-center gap-2">
                <Badge className="border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                  Configured
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Updated {formatDateTime(naukri.updatedAt)}
                </span>
              </div>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not configured
              </Badge>
            )}
          </div>

          {isAdmin ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {CREDENTIAL_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`cred-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`cred-${field.key}`}
                      type="password"
                      autoComplete="new-password"
                      value={form[field.key]}
                      onChange={(e) => setForm((p) => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={naukri ? '••••••••' : `Enter ${field.label.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Credentials are encrypted at rest and used only for official Resdex API calls
                  (Phase 3).
                </p>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!formComplete || saveMutation.isPending}
                >
                  {saveMutation.isPending && <Loader2 className="animate-spin" />}
                  {naukri ? 'Replace credentials' : 'Save credentials'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Credentials can only be entered by administrators. Stored values are never displayed.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

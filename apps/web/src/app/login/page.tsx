'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AuthResponseDto } from '@mfd/shared';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, storeAuth } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const login = useMutation({
    mutationFn: () => api.post<AuthResponseDto>('/auth/login', { email, password }),
    onSuccess: (res) => {
      storeAuth(res);
      router.replace('/dashboard');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Login failed');
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || login.isPending) return;
    login.mutate();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            M
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">MFD Talent Acquisition Tool</CardTitle>
            <CardDescription>GCC staffing partner of NTT DATA</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@metafordata.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

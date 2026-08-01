'use client';

import * as React from 'react';
import { Info } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/use-auth';

import { ProvidersTab } from './providers-tab';
import { UsersTab } from './users-tab';
import { WeightsTab } from './weights-tab';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Users, scoring weights and sourcing provider credentials.
        </p>
      </div>

      {user && !isAdmin && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Info className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Settings are managed by administrators. Scoring weights are shown read-only.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Re-mount when the role resolves so the default tab lands correctly. */}
      <Tabs key={String(isAdmin)} defaultValue={isAdmin ? 'users' : 'weights'}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="weights">Scoring Weights</TabsTrigger>
          <TabsTrigger value="providers">Sourcing Providers</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="weights" className="mt-4">
          <WeightsTab isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <ProvidersTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

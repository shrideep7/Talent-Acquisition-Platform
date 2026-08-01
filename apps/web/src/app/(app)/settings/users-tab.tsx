'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { USER_ROLES, type UserDto, type UserRole } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { formatDate } from '@/lib/utils';

const ROLE_BADGE: Record<UserRole, string> = {
  ADMIN: 'border-transparent bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  RECRUITER: 'border-transparent bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  VIEWER: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
};

const EMPTY_INVITE = { name: '', email: '', password: '', role: 'RECRUITER' as UserRole };

export function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [invite, setInvite] = React.useState(EMPTY_INVITE);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserDto[]>('/users'),
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<UserDto, 'role' | 'isActive'>> }) =>
      api.patch<UserDto>(`/users/${id}`, patch),
    onSuccess: () => {
      toast.success('User updated');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update user');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post<UserDto>('/users', invite),
    onSuccess: (created) => {
      toast.success(`${created.name} invited`);
      setInviteOpen(false);
      setInvite(EMPTY_INVITE);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not create user');
    },
  });

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8">
          <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Only administrators can manage user accounts.
          </p>
        </CardContent>
      </Card>
    );
  }

  const inviteValid =
    invite.name.trim().length > 0 && invite.email.trim().length > 3 && invite.password.length >= 8;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Users</CardTitle>
          <CardDescription>Accounts with access to the MFD Talent Acquisition Tool.</CardDescription>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus />
          Invite user
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !users || users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.name}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        {isSelf ? (
                          <Badge variant="outline" className={ROLE_BADGE[u.role]}>
                            {u.role}
                          </Badge>
                        ) : (
                          <Select
                            value={u.role}
                            onValueChange={(role) =>
                              updateMutation.mutate({ id: u.id, patch: { role: role as UserRole } })
                            }
                            disabled={updateMutation.isPending}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {USER_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.isActive}
                          disabled={isSelf || updateMutation.isPending}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({ id: u.id, patch: { isActive: checked } })
                          }
                          aria-label={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              Create an account and share the password with the new team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={invite.name}
                onChange={(e) => setInvite((p) => ({ ...p, name: e.target.value }))}
                placeholder="Priya Sharma"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))}
                placeholder="priya@metafordata.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                value={invite.password}
                onChange={(e) => setInvite((p) => ({ ...p, password: e.target.value }))}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={invite.role}
                onValueChange={(role) => setInvite((p) => ({ ...p, role: role as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteValid || inviteMutation.isPending}
            >
              {inviteMutation.isPending && <Loader2 className="animate-spin" />}
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

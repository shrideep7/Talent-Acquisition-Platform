'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  ChevronDown,
  FileSearch,
  FolderUp,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRequireAuth } from '@/lib/use-auth';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analyzer', label: 'Analyzer', icon: FileSearch },
  { href: '/naukri-search', label: 'Naukri Search', icon: Search },
  { href: '/sourcing', label: 'Sourcing', icon: FolderUp },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/jds', label: 'Job Descriptions', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
  { href: '/audit', label: 'Audit Log', icon: ScrollText, adminOnly: true },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useRequireAuth();
  const pathname = usePathname();

  const isAdmin = user?.role === 'ADMIN';
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card">
        <div className="flex h-14 items-center border-b px-5">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              M
            </span>
            MFD TAT
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3 text-xs text-muted-foreground">
          MFD Talent Acquisition Tool
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-col pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="text-sm font-medium text-muted-foreground">
            {items.find(
              (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
            )?.label ?? ''}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">
                    {user ? initials(user.name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[10rem] truncate text-sm font-medium">
                  {user?.name ?? ''}
                </span>
                {user && (
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    {user.role}
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Content */}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

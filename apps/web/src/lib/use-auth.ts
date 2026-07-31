'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserDto } from '@mfd/shared';

import { clearAuth, getStoredUser, getToken } from '@/lib/api';

export interface AuthState {
  user: UserDto | null;
  isAuthenticated: boolean;
  logout: () => void;
}

/** Client-side auth state read from localStorage (set at login). */
export function useAuth(): AuthState {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setIsAuthenticated(getToken() !== null);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    router.push('/login');
  }, [router]);

  return { user, isAuthenticated, logout };
}

/** Redirects to /login when no token is stored. Returns the auth state. */
export function useRequireAuth(): AuthState {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    }
  }, [router]);

  return auth;
}

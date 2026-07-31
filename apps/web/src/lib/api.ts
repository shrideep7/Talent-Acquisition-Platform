'use client';

import type { AuthResponseDto, UserDto } from '@mfd/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const TOKEN_KEY = 'mfd_token';
const USER_KEY = 'mfd_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserDto | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserDto;
  } catch {
    return null;
  }
}

export function storeAuth(auth: AuthResponseDto) {
  localStorage.setItem(TOKEN_KEY, auth.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== 'undefined') {
    clearAuth();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
    return handle<T>(res);
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return handle<T>(res);
  },

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return handle<T>(res);
  },

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handle<T>(res);
  },

  /** Multipart upload; fields are appended as-is, files under their field names. */
  async upload<T>(
    path: string,
    files: Record<string, File | File[]>,
    fields?: Record<string, string>,
  ): Promise<T> {
    const form = new FormData();
    for (const [key, value] of Object.entries(files)) {
      if (Array.isArray(value)) {
        for (const f of value) form.append(key, f);
      } else {
        form.append(key, value);
      }
    }
    for (const [key, value] of Object.entries(fields ?? {})) {
      form.append(key, value);
    }
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    return handle<T>(res);
  },

  /** Download a file response as a blob and trigger a browser download. */
  async download(path: string, fallbackName: string): Promise<void> {
    const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
    const disposition = res.headers.get('content-disposition');
    const match = disposition ? /filename="?([^";]+)"?/.exec(disposition) : null;
    const name = match?.[1] ?? fallbackName;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
};

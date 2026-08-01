'use client';

import { ApiError, getToken } from '@/lib/api';

/**
 * PUT helper for the two settings endpoints — the shared api client only
 * exposes get/post/patch/delete, and lib/ is owned by another agent.
 * Mirrors the client's base URL, auth header and error handling exactly.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload = await res.json();
      message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : (payload.message ?? message);
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

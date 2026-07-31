'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { getToken } from '@/lib/api';

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? '/dashboard' : '/login');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

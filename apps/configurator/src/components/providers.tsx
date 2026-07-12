'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PublicBranding } from '@door/contracts';

const BrandingContext = createContext<PublicBranding | null>(null);

export function useBranding(): PublicBranding {
  const branding = useContext(BrandingContext);
  if (!branding) throw new Error('Brak kontekstu brandingu.');
  return branding;
}

export function useText(key: string, fallback: string): string {
  const branding = useContext(BrandingContext);
  return branding?.texts[key] ?? fallback;
}

export function Providers({ branding, children }: { branding: PublicBranding; children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
    </QueryClientProvider>
  );
}

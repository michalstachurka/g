'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from '@door/ui';
import { adminApi, getTenantSlug, setCsrf, setTenantSlug, type AdminSession } from '@/lib/admin-api';

const NAV: { href: string; label: string }[] = [
  { href: '/panel', label: 'Pulpit' },
  { href: '/panel/branding', label: 'Branding i interfejs' },
  { href: '/panel/catalog', label: 'Katalog' },
  { href: '/panel/fields', label: 'Kroki i pola' },
  { href: '/panel/assets', label: 'Asset manager' },
  { href: '/panel/bundles', label: 'Zestawy modułów' },
  { href: '/panel/rules', label: 'Reguły' },
  { href: '/panel/pricing', label: 'Cenniki' },
  { href: '/panel/bom', label: 'BOM' },
  { href: '/panel/templates', label: 'Szablony PDF' },
  { href: '/panel/configurations', label: 'Konfiguracje' },
  { href: '/panel/leads', label: 'Leady' },
  { href: '/panel/users', label: 'Użytkownicy' },
  { href: '/panel/audit', label: 'Audyt' },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));

  useEffect(() => {
    adminApi
      .me()
      .then((me) => {
        setSession(me);
        setCsrf(me.csrfToken);
        if (!getTenantSlug() && me.memberships[0]) setTenantSlug(me.memberships[0].tenantSlug);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  if (!session) {
    return <div className="grid min-h-screen place-items-center text-sm text-[var(--c-text-muted)]">Sprawdzanie sesji…</div>;
  }

  const currentTenant = getTenantSlug();

  return (
    <QueryClientProvider client={client}>
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-surface)] lg:flex">
          <div className="border-b border-[var(--c-border)] px-4 py-4">
            <div className="text-sm font-semibold">Panel konfiguratora</div>
            <select
              className="mt-2 w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-xs"
              value={currentTenant ?? ''}
              onChange={(e) => {
                setTenantSlug(e.target.value);
                window.location.reload();
              }}
            >
              {session.memberships.map((m) => (
                <option key={m.tenantSlug} value={m.tenantSlug}>
                  {m.tenantName} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-[var(--c-primary)] font-medium text-white'
                    : 'text-[var(--c-text-muted)] hover:bg-black/5 hover:text-[var(--c-text)]',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-[var(--c-border)] p-3 text-xs">
            <div className="truncate font-medium">{session.user.name}</div>
            <div className="truncate text-[var(--c-text-muted)]">{session.user.email}</div>
            <button
              className="mt-2 text-[var(--c-error)] hover:underline"
              onClick={async () => {
                await adminApi.logout();
                router.push('/login');
              }}
            >
              Wyloguj
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 lg:hidden">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={cn('whitespace-nowrap rounded-full px-3 py-1 text-xs', pathname === item.href ? 'bg-[var(--c-primary)] text-white' : 'bg-black/5')}>
                {item.label}
              </Link>
            ))}
          </div>
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </QueryClientProvider>
  );
}

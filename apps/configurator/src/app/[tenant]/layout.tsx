import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { PublicBranding } from '@door/contracts';
import { API_URL } from '@/lib/api';
import { themeVars } from '@/lib/theme';
import { Providers } from '@/components/providers';

async function fetchBranding(tenant: string): Promise<PublicBranding | null> {
  try {
    const response = await fetch(`${API_URL}/public/${tenant}/branding`, { next: { revalidate: 30 } });
    if (!response.ok) return null;
    return (await response.json()) as PublicBranding;
  } catch {
    return null;
  }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const branding = await fetchBranding(tenant);
  if (!branding) notFound();

  const vars = themeVars(branding);
  const logoCentered = branding.layout.headerLayout === 'logo_center';

  return (
    <div style={vars} className="flex min-h-screen flex-col bg-[var(--c-bg)] text-[var(--c-text)]">
      <Providers branding={branding}>
        <header className="border-b border-[var(--c-border)] bg-[var(--c-surface)]">
          <div
            className={`mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 ${logoCentered ? 'justify-center' : 'justify-between'}`}
          >
            <Link href={`/${tenant}`} className="flex items-center gap-2.5">
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_URL}${branding.logoUrl}`} alt={branding.companyName} className="h-8 w-auto" />
              ) : (
                <span className="text-lg font-semibold tracking-tight">{branding.companyName}</span>
              )}
            </Link>
            {!logoCentered ? (
              <span className="hidden text-sm text-[var(--c-text-muted)] sm:block">Konfigurator drzwi wewnętrznych</span>
            ) : null}
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--c-border)] bg-[var(--c-surface)] py-5">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-[var(--c-text-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>{branding.footerText ?? branding.companyName}</span>
            <span className="flex gap-4">
              {branding.contact?.phone ? <span>{branding.contact.phone}</span> : null}
              {branding.contact?.email ? <span>{branding.contact.email}</span> : null}
              {branding.legalLinks.map((link) => (
                <a key={link.url} href={link.url} className="underline" target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </span>
          </div>
        </footer>
      </Providers>
    </div>
  );
}

'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Spinner } from '@door/ui';
import { publicApi } from '@/lib/api';
import { useText } from '@/components/providers';

const CATEGORY_ICONS: Record<string, string> = {
  ukryte: 'M4 3h16v18H4z M14 11v2',
  pelne: 'M6 3h12v18H6z M9 12h1.5',
  szklane: 'M6 3h12v18H6z M9 6h6v10H9z',
  przesuwne: 'M3 4h18 M6 6h10v15H6z M19 8l2 2-2 2',
  lustrzane: 'M6 3h12v18H6z M9 15l6-8',
  dwuskrzydlowe: 'M3 3h9v18H3z M12 3h9v18h-9z',
};

export default function CategoryPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const title = useText('start_title', 'Wybierz rodzaj drzwi');
  const subtitle = useText('start_subtitle', 'Skonfiguruj drzwi i zobacz je w swoim wnętrzu.');
  const { data: categories, isLoading, error } = useQuery({
    queryKey: ['categories', tenant],
    queryFn: () => publicApi.categories(tenant),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-[var(--c-text-muted)]">{subtitle}</p>

      {isLoading ? (
        <div className="py-16 text-center">
          <Spinner label="Wczytywanie katalogu…" />
        </div>
      ) : null}
      {error ? (
        <Card className="mt-8 p-6 text-sm text-[var(--c-error)]">Nie udało się pobrać katalogu. Spróbuj ponownie.</Card>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories?.map((category) => {
          const inner = (
            <Card
              className={`flex h-full flex-col gap-3 p-5 transition-shadow ${category.visualizationReady ? 'hover:shadow-md' : 'opacity-90'}`}
            >
              <div className="flex h-24 items-center justify-center rounded-md bg-[var(--c-bg)]">
                <svg width="52" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="1.1">
                  {(CATEGORY_ICONS[category.key] ?? CATEGORY_ICONS.pelne).split(' M').map((d, i) => (
                    <path key={i} d={(i === 0 ? '' : 'M') + d} strokeLinecap="round" />
                  ))}
                </svg>
              </div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{category.name}</h2>
                {!category.visualizationReady ? <Badge tone="warning">bez podglądu 3D</Badge> : null}
              </div>
              <p className="text-sm text-[var(--c-text-muted)]">{category.description}</p>
              {!category.visualizationReady && category.missingAssetNotice ? (
                <p className="mt-auto text-xs text-[var(--c-warning)]">{category.missingAssetNotice}</p>
              ) : (
                <span className="mt-auto text-sm font-medium text-[var(--c-accent)]">Konfiguruj →</span>
              )}
            </Card>
          );
          return (
            <Link key={category.key} href={`/${tenant}/k/${category.key}`} className="block h-full">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

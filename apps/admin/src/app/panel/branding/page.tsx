'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner } from '@door/ui';
import { adminApi, API_URL } from '@/lib/admin-api';
import { PageHeader, TextInput, SelectInput } from '@/components/shared';

const COLOR_FIELDS: [string, string][] = [
  ['colorPrimary', 'Kolor główny'],
  ['colorAccent', 'Kolor akcentu'],
  ['colorBackground', 'Tło strony'],
  ['colorSurface', 'Tło paneli'],
  ['colorText', 'Tekst'],
  ['colorTextMuted', 'Tekst drugorzędny'],
  ['colorBorder', 'Obramowania'],
  ['colorSuccess', 'Sukces'],
  ['colorWarning', 'Ostrzeżenie'],
  ['colorError', 'Błąd'],
];

const TEXT_KEYS: [string, string][] = [
  ['start_title', 'Nagłówek ekranu startowego'],
  ['start_subtitle', 'Podtytuł ekranu startowego'],
  ['price_label', 'Etykieta ceny'],
  ['cta_save', 'CTA: zapis projektu'],
  ['cta_pdf', 'CTA: PDF'],
  ['cta_ar', 'CTA: AR'],
  ['cta_lead', 'CTA: zapytanie o wycenę'],
  ['field_width', 'Nazwa pola szerokości (przykład edycji nazwy pola)'],
];

export default function BrandingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['branding'], queryFn: adminApi.branding });
  const [theme, setTheme] = useState<Record<string, unknown>>({});
  const [layout, setLayout] = useState<Record<string, unknown>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [footerText, setFooterText] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const draft = data?.draft;
    if (!draft) return;
    setTheme((draft.themeTokens as Record<string, unknown>) ?? {});
    setLayout((draft.layout as Record<string, unknown>) ?? {});
    setTexts((draft.texts as Record<string, string>) ?? {});
    setFooterText((draft.footerText as string) ?? '');
    setLogoUrl((draft.logoUrl as string) ?? null);
    setFaviconUrl((draft.faviconUrl as string) ?? null);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateBranding({ themeTokens: theme, layout, texts, footerText, logoUrl, faviconUrl }),
    onSuccess: () => {
      setSavedAt(Date.now());
      queryClient.invalidateQueries({ queryKey: ['branding'] });
    },
  });
  const publish = useMutation({
    mutationFn: adminApi.publishBranding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
  });

  if (isLoading || !data) return <Spinner label="Wczytywanie brandingu…" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Branding i interfejs"
        description={`Wersja robocza v${(data.draft as { version: number }).version}. Opublikowana: ${data.publishedVersion ? 'v' + data.publishedVersion : 'brak'}. Zmiany działają w konfiguratorze po publikacji.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Zapisywanie…' : savedAt ? 'Zapisano ✓' : 'Zapisz szkic'}
            </Button>
            <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
              Opublikuj
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Logo i favicon</h2>
          <div className="flex flex-wrap items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_URL}${logoUrl}`} alt="Logo" className="h-10 rounded border border-[var(--c-border)] bg-white p-1" />
            ) : (
              <span className="text-xs text-[var(--c-text-muted)]">Brak logo - wyświetlana jest nazwa firmy.</span>
            )}
            <label className="cursor-pointer text-sm text-[var(--c-accent)] underline">
              Wgraj logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const { url } = await adminApi.uploadBrandingFile(file);
                  setLogoUrl(url);
                }}
              />
            </label>
            <label className="cursor-pointer text-sm text-[var(--c-accent)] underline">
              Wgraj favicon
              <input
                type="file"
                accept="image/png,image/x-icon,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const { url } = await adminApi.uploadBrandingFile(file);
                  setFaviconUrl(url);
                }}
              />
            </label>
            {faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_URL}${faviconUrl}`} alt="Favicon" className="h-6 w-6" />
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Kolory</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {COLOR_FIELDS.map(([key, label]) => (
              <label key={key} className="block text-xs">
                <span className="mb-1 block text-[var(--c-text-muted)]">{label}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={(theme[key] as string) ?? '#000000'}
                    onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-[var(--c-border)]"
                  />
                  <input
                    value={(theme[key] as string) ?? ''}
                    onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                    className="w-full rounded border border-[var(--c-border)] px-1.5 py-1 font-mono text-[11px]"
                  />
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TextInput
              label="Promień narożników (px)"
              type="number"
              min={0}
              max={32}
              value={Number(theme.radiusPx ?? 8)}
              onChange={(e) => setTheme({ ...theme, radiusPx: Number(e.target.value) })}
            />
            <SelectInput
              label="Gęstość odstępów"
              value={String(theme.density ?? 'regular')}
              onChange={(e) => setTheme({ ...theme, density: e.target.value })}
              options={[
                { value: 'compact', label: 'Kompaktowa' },
                { value: 'regular', label: 'Standardowa' },
                { value: 'comfortable', label: 'Komfortowa' },
              ]}
            />
            <SelectInput
              label="Cienie"
              value={String(theme.shadowLevel ?? 'soft')}
              onChange={(e) => setTheme({ ...theme, shadowLevel: e.target.value })}
              options={[
                { value: 'none', label: 'Brak' },
                { value: 'soft', label: 'Miękkie' },
                { value: 'strong', label: 'Wyraźne' },
              ]}
            />
            <SelectInput
              label="Font (bezpieczna lista)"
              value={String(theme.fontBody ?? 'system-ui')}
              onChange={(e) => setTheme({ ...theme, fontBody: e.target.value, fontHeading: e.target.value })}
              options={[
                { value: 'system-ui', label: 'Systemowy' },
                { value: 'Georgia, serif', label: 'Szeryfowy (Georgia)' },
                { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
              ]}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Układ interfejsu</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SelectInput
              label="Preset układu"
              value={String(layout.preset ?? 'panel_right')}
              onChange={(e) => setLayout({ ...layout, preset: e.target.value })}
              options={[
                { value: 'panel_right', label: 'Panel po prawej' },
                { value: 'panel_left', label: 'Panel po lewej' },
                { value: 'compact_top', label: 'Kompaktowy (mobile first)' },
              ]}
            />
            <TextInput
              label="Szerokość panelu (px)"
              type="number"
              min={320}
              max={640}
              value={Number(layout.panelWidthPx ?? 420)}
              onChange={(e) => setLayout({ ...layout, panelWidthPx: Number(e.target.value) })}
            />
            <TextInput
              label="Wysokość viewera mobile (vh)"
              type="number"
              min={30}
              max={70}
              value={Number(layout.viewerHeightMobileVh ?? 44)}
              onChange={(e) => setLayout({ ...layout, viewerHeightMobileVh: Number(e.target.value) })}
            />
            <SelectInput
              label="Widoczność ceny"
              value={layout.showPrice === false ? 'hidden' : 'visible'}
              onChange={(e) => setLayout({ ...layout, showPrice: e.target.value === 'visible' })}
              options={[
                { value: 'visible', label: 'Pokazuj cenę' },
                { value: 'hidden', label: 'Ukryj cenę' },
              ]}
            />
            <SelectInput
              label="Styl kart opcji"
              value={String(layout.optionCardStyle ?? 'tiles')}
              onChange={(e) => setLayout({ ...layout, optionCardStyle: e.target.value })}
              options={[
                { value: 'tiles', label: 'Kafelki' },
                { value: 'list', label: 'Lista' },
              ]}
            />
            <SelectInput
              label="Styl przycisków"
              value={String(layout.buttonStyle ?? 'solid')}
              onChange={(e) => setLayout({ ...layout, buttonStyle: e.target.value })}
              options={[
                { value: 'solid', label: 'Wypełnione' },
                { value: 'outline', label: 'Kontur' },
              ]}
            />
            <SelectInput
              label="Nagłówek"
              value={String(layout.headerLayout ?? 'logo_left')}
              onChange={(e) => setLayout({ ...layout, headerLayout: e.target.value })}
              options={[
                { value: 'logo_left', label: 'Logo po lewej' },
                { value: 'logo_center', label: 'Logo wyśrodkowane' },
              ]}
            />
            <SelectInput
              label="Publiczne pozycje dopłat"
              value={layout.showPriceLines === true ? 'yes' : 'no'}
              onChange={(e) => setLayout({ ...layout, showPriceLines: e.target.value === 'yes' })}
              options={[
                { value: 'yes', label: 'Pokazuj' },
                { value: 'no', label: 'Ukryj' },
              ]}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Teksty interfejsu</h2>
          <p className="mb-3 text-xs text-[var(--c-text-muted)]">
            Nazwy pól i kroków edytujesz w zakładce Kroki i pola. Tutaj: nagłówki, CTA i etykiety globalne.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEXT_KEYS.map(([key, label]) => (
              <TextInput
                key={key}
                label={label}
                className="w-full"
                value={texts[key] ?? ''}
                onChange={(e) => setTexts({ ...texts, [key]: e.target.value })}
              />
            ))}
          </div>
          <div className="mt-3">
            <TextInput label="Stopka" className="w-full" value={footerText} onChange={(e) => setFooterText(e.target.value)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

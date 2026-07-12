'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Spinner } from '@door/ui';
import { formatPrice, publicApi } from '@/lib/api';
import { DoorViewer } from '@/components/DoorViewer';
import { useText } from '@/components/providers';

/** Publiczny widok zapisanej konfiguracji (link udostępniony / QR). */
export default function SharedConfigurationPage({
  params,
}: {
  params: Promise<{ tenant: string; shareId: string }>;
}) {
  const { tenant, shareId } = use(params);
  const [open, setOpen] = useState(false);
  const [viewSide, setViewSide] = useState<'a' | 'b'>('a');
  const ctaAr = useText('cta_ar', 'Zobacz na swojej ścianie (AR)');
  const ctaPdf = useText('cta_pdf', 'Pobierz specyfikację PDF');
  const [pdfState, setPdfState] = useState<'idle' | 'generating' | 'failed'>('idle');

  const { data, isLoading, error } = useQuery({
    queryKey: ['configuration', tenant, shareId],
    queryFn: () => publicApi.getConfiguration(tenant, shareId),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner label="Wczytywanie konfiguracji…" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Nie znaleziono konfiguracji</h1>
        <p className="mt-2 text-sm text-[var(--c-text-muted)]">Link mógł wygasnąć albo został usunięty.</p>
        <Link href={`/${tenant}`} className="mt-4 inline-block">
          <Button>Rozpocznij nową konfigurację</Button>
        </Link>
      </div>
    );
  }

  const evaluate = data.evaluate;
  const renderSpec = evaluate?.renderSpec ?? null;

  async function downloadPdf() {
    setPdfState('generating');
    try {
      const { documentId } = await publicApi.requestDocument(tenant, shareId);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await publicApi.documentStatus(tenant, documentId);
        if (status.status === 'done' && status.downloadUrl) {
          window.open(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}${status.downloadUrl}`, '_blank');
          setPdfState('idle');
          return;
        }
        if (status.status === 'failed') break;
      }
      setPdfState('failed');
    } catch {
      setPdfState('failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="relative h-[52vh] overflow-hidden lg:h-[70vh]">
          {renderSpec ? (
            <DoorViewer tenant={tenant} renderSpec={renderSpec} open={open} viewSide={viewSide} />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center">
              <Badge tone="warning">Wizualizacja niedostępna dla tej konfiguracji</Badge>
            </div>
          )}
          {renderSpec ? (
            <div className="absolute left-3 top-3 flex gap-1.5">
              <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
                {open ? 'Zamknij drzwi' : 'Otwórz drzwi'}
              </Button>
              <Button variant="secondary" onClick={() => setViewSide(viewSide === 'a' ? 'b' : 'a')}>
                Strona {viewSide === 'a' ? 'B' : 'A'}
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">{data.name ?? 'Zapisana konfiguracja'}</h1>
            <p className="text-sm text-[var(--c-text-muted)]">
              Numer: {data.shareId} | wersja {data.revision} | zapisano {new Date(data.createdAt).toLocaleDateString('pl-PL')}
            </p>
          </div>

          {evaluate?.priceSummary ? (
            <Card className="p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--c-text-muted)]">Cena brutto</span>
                <span className="text-2xl font-semibold">
                  {evaluate.priceSummary.individualQuote
                    ? 'Wycena indywidualna'
                    : formatPrice(evaluate.priceSummary.amount, evaluate.priceSummary.currency)}
                </span>
              </div>
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Podsumowanie</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {Object.entries(data.selections)
                .filter(([key]) => !key.startsWith('_'))
                .map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-[var(--c-text-muted)]">{key.replaceAll('_', ' ')}</dt>
                    <dd className="text-right font-medium">{String(value ?? '-')}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          <div className="flex flex-col gap-2">
            <Link href={`/${tenant}/ar/${shareId}`}>
              <Button className="w-full">{ctaAr}</Button>
            </Link>
            <Button variant="secondary" onClick={downloadPdf} disabled={pdfState === 'generating'}>
              {pdfState === 'generating' ? 'Generowanie PDF…' : ctaPdf}
            </Button>
            {pdfState === 'failed' ? (
              <p className="text-center text-xs text-[var(--c-error)]">Generowanie nie powiodło się. Spróbuj ponownie za chwilę.</p>
            ) : null}
            <Link href={`/${tenant}/k/${data.categoryKey}`}>
              <Button variant="ghost" className="w-full">Zmień konfigurację</Button>
            </Link>
          </div>

          <div className="hidden justify-center lg:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="text-center">
              <img
                src={publicApi.qrUrl(tenant, `/${tenant}/c/${shareId}`)}
                alt="Kod QR"
                className="mx-auto h-36 w-36 rounded-md border border-[var(--c-border)] bg-white p-2"
              />
              <p className="mt-1 text-xs text-[var(--c-text-muted)]">Otwórz na telefonie, aby użyć AR</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

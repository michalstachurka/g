'use client';

import { useState } from 'react';
import type { EvaluateResponse } from '@door/contracts';
import { Button, Modal, Spinner } from '@door/ui';
import { publicApi } from '@/lib/api';
import { useText } from './providers';

type SaveResult = { shareId: string; revision: number; evaluate: EvaluateResponse };

/**
 * Zapis, link publiczny, QR, PDF, wysyłka mailem i zapytanie o wycenę.
 * Wszystkie operacje wykonuje backend; dialog tylko prezentuje wyniki.
 */
export function SaveShareDialog({
  open,
  onClose,
  tenant,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  onSave: () => Promise<SaveResult>;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pdfState, setPdfState] = useState<'idle' | 'generating' | 'ready' | 'failed'>('idle');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [lead, setLead] = useState({ name: '', phone: '', email: '', message: '', consent: false });
  const [leadState, setLeadState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const ctaPdf = useText('cta_pdf', 'Pobierz specyfikację PDF');
  const ctaLead = useText('cta_lead', 'Wyślij zapytanie o wycenę');
  const ctaAr = useText('cta_ar', 'Zobacz w AR');

  async function handleSave() {
    setState('saving');
    try {
      const saved = await onSave();
      setResult(saved);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  async function handlePdf() {
    if (!result) return;
    setPdfState('generating');
    try {
      const { documentId } = await publicApi.requestDocument(tenant, result.shareId);
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await publicApi.documentStatus(tenant, documentId);
        if (status.status === 'done' && status.downloadUrl) {
          setPdfUrl(status.downloadUrl);
          setPdfState('ready');
          return;
        }
        if (status.status === 'failed') break;
      }
      setPdfState('failed');
    } catch {
      setPdfState('failed');
    }
  }

  const shareUrl = result ? `${window.location.origin}/${tenant}/c/${result.shareId}` : null;

  return (
    <Modal open={open} onClose={onClose} title="Zapisz i udostępnij" wide>
      {state === 'idle' || state === 'saving' || state === 'error' ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--c-text-muted)]">
            Konfiguracja zostanie ponownie zweryfikowana i wyceniona na serwerze, a następnie zapisana pod
            bezpiecznym linkiem, którym możesz się podzielić.
          </p>
          {state === 'error' ? <p className="text-sm text-[var(--c-error)]">Zapis nie powiódł się. Spróbuj ponownie.</p> : null}
          <Button onClick={handleSave} disabled={state === 'saving'}>
            {state === 'saving' ? 'Zapisywanie…' : 'Zapisz projekt'}
          </Button>
        </div>
      ) : null}

      {state === 'saved' && result && shareUrl ? (
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm font-medium">Link do konfiguracji</div>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(shareUrl)}>Kopiuj</Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Dokumenty i AR</div>
              <div className="flex flex-wrap gap-2">
                {pdfState === 'ready' && pdfUrl ? (
                  <a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}${pdfUrl}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary">Otwórz PDF</Button>
                  </a>
                ) : (
                  <Button variant="secondary" onClick={handlePdf} disabled={pdfState === 'generating'}>
                    {pdfState === 'generating' ? <Spinner label="Generowanie…" /> : ctaPdf}
                  </Button>
                )}
                <a href={`/${tenant}/ar/${result.shareId}`}>
                  <Button variant="secondary">{ctaAr}</Button>
                </a>
              </div>
              {pdfState === 'failed' ? (
                <p className="text-xs text-[var(--c-error)]">Generowanie PDF nie powiodło się. Upewnij się, że worker jest uruchomiony, i spróbuj ponownie.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-medium">Wyślij link na e-mail</div>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="adres@e-mail.pl"
                  className="w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={!email.includes('@') || emailSent}
                  onClick={async () => {
                    await publicApi.emailConfiguration(tenant, result.shareId, email);
                    setEmailSent(true);
                  }}
                >
                  {emailSent ? 'Wysłano' : 'Wyślij'}
                </Button>
              </div>
            </div>

            <details className="rounded-md border border-[var(--c-border)] p-3">
              <summary className="cursor-pointer text-sm font-medium">{ctaLead}</summary>
              {leadState === 'sent' ? (
                <p className="mt-2 text-sm text-[var(--c-success)]">Dziękujemy. Doradca skontaktuje się w sprawie wyceny.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  <input placeholder="Imię i nazwisko *" className="w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-sm" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
                  <div className="flex gap-2">
                    <input placeholder="Telefon" className="w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-sm" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
                    <input placeholder="E-mail" className="w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-sm" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
                  </div>
                  <textarea placeholder="Wiadomość" rows={2} className="w-full rounded-md border border-[var(--c-border)] px-2 py-1.5 text-sm" value={lead.message} onChange={(e) => setLead({ ...lead, message: e.target.value })} />
                  <label className="flex items-start gap-2 text-xs text-[var(--c-text-muted)]">
                    <input type="checkbox" checked={lead.consent} onChange={(e) => setLead({ ...lead, consent: e.target.checked })} className="mt-0.5" />
                    Wyrażam zgodę na kontakt w sprawie tej wyceny. *
                  </label>
                  {leadState === 'error' ? <p className="text-xs text-[var(--c-error)]">Nie udało się wysłać zapytania. Uzupełnij wymagane pola.</p> : null}
                  <Button
                    disabled={leadState === 'sending' || !lead.consent || lead.name.length < 2}
                    onClick={async () => {
                      setLeadState('sending');
                      try {
                        await publicApi.sendLead(tenant, {
                          name: lead.name,
                          phone: lead.phone || undefined,
                          email: lead.email || undefined,
                          message: lead.message || undefined,
                          consent: true,
                          configurationShareId: result.shareId,
                        });
                        setLeadState('sent');
                      } catch {
                        setLeadState('error');
                      }
                    }}
                  >
                    Wyślij zapytanie
                  </Button>
                </div>
              )}
            </details>
          </div>

          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicApi.qrUrl(tenant, `/${tenant}/c/${result.shareId}`)}
              alt="Kod QR do konfiguracji"
              className="h-40 w-40 rounded-md border border-[var(--c-border)] bg-white p-2"
            />
            <p className="max-w-40 text-center text-xs text-[var(--c-text-muted)]">
              Zeskanuj telefonem, aby otworzyć konfigurację i uruchomić AR.
            </p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

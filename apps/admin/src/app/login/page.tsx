'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@door/ui';
import { adminApi, setCsrf, setTenantSlug } from '@/lib/admin-api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await adminApi.login(email, password);
      setCsrf(session.csrfToken);
      const first = session.memberships[0];
      if (first) setTenantSlug(first.tenantSlug);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Panel administracyjny</h1>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">Zaloguj się, aby zarządzać konfiguratorem.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">E-mail</span>
            <input
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-[var(--radius)] border border-[var(--c-border)] px-3 py-2 text-sm outline-none focus:border-[var(--c-primary)]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Hasło</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-[var(--radius)] border border-[var(--c-border)] px-3 py-2 text-sm outline-none focus:border-[var(--c-primary)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-[var(--c-error)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Logowanie…' : 'Zaloguj się'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

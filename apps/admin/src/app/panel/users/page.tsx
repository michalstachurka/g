'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Spinner } from '@door/ui';
import { adminApi } from '@/lib/admin-api';
import { DataTable, InlineForm, PageHeader, SelectInput, TextInput } from '@/components/shared';

interface UserRow { id: string; email: string; name: string; role: string; disabled: boolean; membershipId: string; createdAt: string }

const ROLE_OPTIONS = [
  { value: 'tenant_admin', label: 'Administrator' },
  { value: 'sales', label: 'Sprzedaż' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'production', label: 'Produkcja' },
  { value: 'viewer', label: 'Tylko odczyt' },
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: adminApi.users });
  const [invite, setInvite] = useState({ email: '', name: '', role: 'sales' });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  if (isLoading || !data) return <Spinner label="Wczytywanie użytkowników…" />;

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Użytkownicy i role" description="RBAC egzekwowany na backendzie. BOM i dane produkcyjne widzą tylko role: administrator i produkcja." />
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Zaproś użytkownika</h2>
        <InlineForm
          submitLabel="Zaproś"
          onSubmit={async () => {
            const result = await adminApi.inviteUser(invite);
            setTempPassword(result.temporaryPassword);
            setInvite({ email: '', name: '', role: 'sales' });
            refresh();
          }}
        >
          <TextInput label="E-mail" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <TextInput label="Imię i nazwisko" required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <SelectInput label="Rola" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} options={ROLE_OPTIONS} />
        </InlineForm>
        {tempPassword ? (
          <p className="mt-2 text-xs text-[var(--c-warning)]">Hasło tymczasowe (przekaż bezpiecznym kanałem): <code>{tempPassword}</code></p>
        ) : null}
      </Card>
      <DataTable
        headers={['Użytkownik', 'E-mail', 'Rola', 'Aktywny', 'Od']}
        rows={(data as UserRow[]).map((user) => [
          user.name,
          user.email,
          <select
            key="r"
            className="rounded border border-[var(--c-border)] px-1.5 py-1 text-xs"
            value={user.role}
            onChange={async (e) => { await adminApi.updateMembership(user.membershipId, { role: e.target.value }); refresh(); }}
          >
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>,
          <input key="d" type="checkbox" checked={!user.disabled} onChange={async (e) => { await adminApi.updateMembership(user.membershipId, { disabled: !e.target.checked }); refresh(); }} />,
          new Date(user.createdAt).toLocaleDateString('pl-PL'),
        ])}
      />
    </div>
  );
}

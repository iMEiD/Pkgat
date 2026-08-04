import type { Metadata } from 'next';

import { AdminEventsTable } from './AdminEventsTable';
import { createServiceClient } from '@/lib/supabase/server';
import type { EventRow } from '@/lib/types/database';

export const metadata: Metadata = { title: 'كل المناسبات' };
export const dynamic = 'force-dynamic';

export interface AdminEventRow extends EventRow {
  owner_name: string;
  owner_email: string;
  guest_count: number;
  attended_count: number;
}

export default async function AdminEventsPage() {
  const supabase = createServiceClient();

  const [{ data: events }, { data: profiles }, { data: guests }] = await Promise.all([
    supabase.from('events').select('*').order('created_at', { ascending: false }).limit(300),
    supabase.from('profiles').select('id, full_name, email'),
    supabase.from('guests').select('event_id, checked_in_at'),
  ]);

  const owners = new Map((profiles ?? []).map((p) => [p.id, p]));
  const counts = new Map<string, { total: number; attended: number }>();

  for (const guest of guests ?? []) {
    const entry = counts.get(guest.event_id) ?? { total: 0, attended: 0 };
    entry.total += 1;
    if (guest.checked_in_at) entry.attended += 1;
    counts.set(guest.event_id, entry);
  }

  const rows: AdminEventRow[] = ((events ?? []) as EventRow[]).map((event) => ({
    ...event,
    owner_name: owners.get(event.owner_id)?.full_name ?? '—',
    owner_email: owners.get(event.owner_id)?.email ?? '—',
    guest_count: counts.get(event.id)?.total ?? 0,
    attended_count: counts.get(event.id)?.attended ?? 0,
  }));

  return <AdminEventsTable events={rows} />;
}

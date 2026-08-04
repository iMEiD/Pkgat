import type { Metadata } from 'next';

import { AdminUsersTable } from './AdminUsersTable';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { Profile } from '@/lib/types/database';

export const metadata: Metadata = { title: 'المستخدمون' };
export const dynamic = 'force-dynamic';

export interface AdminUserRow extends Profile {
  event_count: number;
  has_subscription: boolean;
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: events }, { data: subs }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('events').select('owner_id'),
    supabase.from('subscriptions').select('user_id, current_period_end').eq('status', 'active'),
  ]);

  const eventCounts = new Map<string, number>();
  for (const event of events ?? []) {
    eventCounts.set(event.owner_id, (eventCounts.get(event.owner_id) ?? 0) + 1);
  }

  const subscribed = new Set(
    (subs ?? [])
      .filter((s) => !s.current_period_end || new Date(s.current_period_end) > new Date())
      .map((s) => s.user_id),
  );

  const rows: AdminUserRow[] = ((profiles ?? []) as Profile[]).map((profile) => ({
    ...profile,
    event_count: eventCounts.get(profile.id) ?? 0,
    has_subscription: subscribed.has(profile.id),
  }));

  return <AdminUsersTable users={rows} currentAdminId={admin.id} />;
}

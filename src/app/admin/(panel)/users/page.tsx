import type { Metadata } from 'next';

import { AdminUsersTable } from './AdminUsersTable';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { Profile } from '@/lib/types/database';

export const metadata: Metadata = { title: 'المستخدمون' };
export const dynamic = 'force-dynamic';

export interface AdminUserRow extends Profile {
  event_count: number;
  guest_count: number;
  has_subscription: boolean;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: events }, { data: subs }, authList] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('events').select('id, owner_id'),
    supabase.from('subscriptions').select('user_id, current_period_end').eq('status', 'active'),
    // بيانات الدخول والتأكيد تعيش في auth.users لا في جدول الملفات
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const eventCounts = new Map<string, number>();
  const eventOwner = new Map<string, string>();
  for (const event of events ?? []) {
    eventCounts.set(event.owner_id, (eventCounts.get(event.owner_id) ?? 0) + 1);
    eventOwner.set(event.id, event.owner_id);
  }

  // عدد المدعوين لكل مالك — مؤشر مفيد على حجم استخدامه الفعلي
  const guestCounts = new Map<string, number>();
  const eventIds = [...eventOwner.keys()];
  if (eventIds.length > 0) {
    const { data: guests } = await supabase.from('guests').select('event_id');
    for (const guest of guests ?? []) {
      const owner = eventOwner.get(guest.event_id);
      if (owner) guestCounts.set(owner, (guestCounts.get(owner) ?? 0) + 1);
    }
  }

  const subscribed = new Set(
    (subs ?? [])
      .filter((s) => !s.current_period_end || new Date(s.current_period_end) > new Date())
      .map((s) => s.user_id),
  );

  const authUsers = new Map(
    (authList.data?.users ?? []).map((u) => [
      u.id,
      {
        lastSignIn: u.last_sign_in_at ?? null,
        confirmed: Boolean(u.email_confirmed_at),
        phone: u.phone ?? null,
      },
    ]),
  );

  const rows: AdminUserRow[] = ((profiles ?? []) as Profile[]).map((profile) => {
    const auth = authUsers.get(profile.id);
    return {
      ...profile,
      // نُفضّل الجوال المحفوظ في الملف، ونرجع لما سجّله في المصادقة
      phone: profile.phone ?? auth?.phone ?? null,
      event_count: eventCounts.get(profile.id) ?? 0,
      guest_count: guestCounts.get(profile.id) ?? 0,
      has_subscription: subscribed.has(profile.id),
      last_sign_in_at: auth?.lastSignIn ?? null,
      email_confirmed: auth?.confirmed ?? false,
    };
  });

  return <AdminUsersTable users={rows} currentAdminId={admin.id} />;
}

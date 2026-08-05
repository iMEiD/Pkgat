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
  // تفاصيل العضوية الفعّالة — تظهر في نافذة التعديل
  membership_plan_id: string | null;
  membership_plan_name: string | null;
  membership_ends_at: string | null;
  membership_granted: boolean;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const supabase = createServiceClient();

  const [{ data: profiles }, { data: events }, { data: subs }, { data: plans }, authList] =
    await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('events').select('id, owner_id'),
      supabase
        .from('subscriptions')
        .select('user_id, plan_id, current_period_end, provider_ref')
        .eq('status', 'active'),
      supabase.from('plans').select('id, name, billing_period').order('sort_order'),
      // بيانات الدخول والتأكيد تعيش في auth.users لا في جدول الملفات
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  const planNames = new Map((plans ?? []).map((p) => [p.id, p.name]));

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

  const activeSubs = new Map(
    (subs ?? [])
      .filter((s) => !s.current_period_end || new Date(s.current_period_end) > new Date())
      .map((s) => [s.user_id, s]),
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
    const sub = activeSubs.get(profile.id);
    return {
      ...profile,
      // نُفضّل الجوال المحفوظ في الملف، ونرجع لما سجّله في المصادقة
      phone: profile.phone ?? auth?.phone ?? null,
      event_count: eventCounts.get(profile.id) ?? 0,
      guest_count: guestCounts.get(profile.id) ?? 0,
      has_subscription: Boolean(sub),
      membership_plan_id: sub?.plan_id ?? null,
      membership_plan_name: sub ? (planNames.get(sub.plan_id) ?? null) : null,
      membership_ends_at: sub?.current_period_end ?? null,
      membership_granted: sub?.provider_ref === 'admin_grant',
      last_sign_in_at: auth?.lastSignIn ?? null,
      email_confirmed: auth?.confirmed ?? false,
    };
  });

  return (
    <AdminUsersTable
      users={rows}
      currentAdminId={admin.id}
      plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}

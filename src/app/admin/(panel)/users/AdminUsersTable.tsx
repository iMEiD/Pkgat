'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { setUserSuspended } from '@/lib/actions/admin';
import { formatDate, formatNumber } from '@/lib/utils/format';
import type { AdminUserRow } from './page';

export function AdminUsersTable({
  users,
  currentAdminId,
}: {
  users: AdminUserRow[];
  currentAdminId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'suspended' | 'subscribed' | 'admins'>('all');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (
        q &&
        !(user.full_name ?? '').toLowerCase().includes(q) &&
        !(user.email ?? '').toLowerCase().includes(q)
      )
        return false;

      if (filter === 'suspended') return user.is_suspended;
      if (filter === 'subscribed') return user.has_subscription;
      if (filter === 'admins') return user.is_super_admin;
      return true;
    });
  }, [users, query, filter]);

  function toggle(user: AdminUserRow) {
    const action = user.is_suspended ? 'إعادة تفعيل' : 'إيقاف';
    if (!confirm(`${action} حساب «${user.full_name || user.email}»؟`)) return;

    setError(null);
    startTransition(async () => {
      const res = await setUserSuspended(user.id, !user.is_suspended);
      if (!res.ok) setError(res.error ?? 'تعذّر التحديث.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black text-ink">المستخدمون</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          {formatNumber(users.length)} حساب مسجّل على المنصة.
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title={`النتائج (${formatNumber(filtered.length)})`} />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو البريد…"
            />
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">كل المستخدمين</option>
              <option value="subscribed">أصحاب اشتراكات</option>
              <option value="suspended">حسابات موقوفة</option>
              <option value="admins">المشرفون</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">لا نتائج.</p>
          ) : (
            <div className="overflow-x-auto pk-scrollbar">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-right text-xs text-ink-faint">
                    <th className="py-2.5 font-semibold">المستخدم</th>
                    <th className="py-2.5 font-semibold">المناسبات</th>
                    <th className="py-2.5 font-semibold">الحالة</th>
                    <th className="py-2.5 font-semibold">التسجيل</th>
                    <th className="w-32 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id} className="border-b border-sand-100 hover:bg-sand-50">
                      <td className="py-3">
                        <p className="font-semibold text-ink">{user.full_name || '—'}</p>
                        <p className="text-xs text-ink-faint" dir="ltr">
                          {user.email}
                        </p>
                      </td>
                      <td className="py-3 tabular-nums text-ink-soft">
                        {formatNumber(user.event_count)}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.is_super_admin && <Badge tone="grape">أدمن</Badge>}
                          {user.has_subscription && <Badge tone="mint">مشترك</Badge>}
                          {user.is_suspended && <Badge tone="coral">موقوف</Badge>}
                          {!user.is_super_admin && !user.has_subscription && !user.is_suspended && (
                            <Badge tone="sand">عادي</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-xs text-ink-soft">{formatDate(user.created_at)}</td>
                      <td className="py-3 text-left">
                        {user.id === currentAdminId ? (
                          <span className="text-xs text-ink-faint">أنت</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggle(user)}
                            disabled={pending}
                            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                              user.is_suspended
                                ? 'bg-mint-50 text-mint-600 hover:bg-mint-100'
                                : 'bg-coral-50 text-coral-600 hover:bg-coral-100'
                            }`}
                          >
                            {user.is_suspended ? 'تفعيل' : 'إيقاف'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Stat } from '@/components/ui/Misc';
import { adminUpdateUser, setUserSuspended } from '@/lib/actions/admin';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils/format';
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
  const [filter, setFilter] = useState<
    'all' | 'suspended' | 'subscribed' | 'admins' | 'with_phone' | 'unconfirmed'
  >('all');
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (
        q &&
        !(user.full_name ?? '').toLowerCase().includes(q) &&
        !(user.email ?? '').toLowerCase().includes(q) &&
        !(user.phone ?? '').includes(q)
      )
        return false;

      if (filter === 'suspended') return user.is_suspended;
      if (filter === 'subscribed') return user.has_subscription;
      if (filter === 'admins') return user.is_super_admin;
      if (filter === 'with_phone') return Boolean(user.phone);
      if (filter === 'unconfirmed') return !user.email_confirmed;
      return true;
    });
  }, [users, query, filter]);

  const withPhone = users.filter((u) => u.phone).length;
  const active = users.filter((u) => u.event_count > 0).length;

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

  /** تصدير القائمة المعروضة كملف CSV يفتح في Excel بالعربية */
  function exportCsv() {
    const header = ['الاسم', 'البريد', 'الجوال', 'المناسبات', 'المدعوون', 'مشترك', 'التسجيل'];
    const rows = filtered.map((u) => [
      u.full_name ?? '',
      u.email ?? '',
      u.phone ?? '',
      String(u.event_count),
      String(u.guest_count),
      u.has_subscription ? 'نعم' : 'لا',
      new Date(u.created_at).toISOString().slice(0, 10),
    ]);

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');

    // BOM ضروري ليقرأ Excel العربية بشكل صحيح
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pkgat-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">المستخدمون</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            بيانات التواصل وحجم الاستخدام لكل حساب — قابلة للتعديل والتصدير.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
          <Icon name="download" className="h-4 w-4" />
          تصدير CSV ({formatNumber(filtered.length)})
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="إجمالي الحسابات" value={formatNumber(users.length)} tone="grape" />
        <Stat label="أنشأوا مناسبات" value={formatNumber(active)} tone="mint" />
        <Stat label="لديهم رقم جوال" value={formatNumber(withPhone)} tone="sky" />
        <Stat
          label="مشتركون"
          value={formatNumber(users.filter((u) => u.has_subscription).length)}
          tone="sunny"
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title={`النتائج (${formatNumber(filtered.length)})`} />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو البريد أو الجوال…"
            />
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">كل المستخدمين</option>
              <option value="with_phone">لديهم رقم جوال</option>
              <option value="subscribed">أصحاب اشتراكات</option>
              <option value="unconfirmed">لم يؤكدوا بريدهم</option>
              <option value="suspended">حسابات موقوفة</option>
              <option value="admins">المشرفون</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">لا نتائج.</p>
          ) : (
            <>
              {/* الجوال: بطاقات */}
              <ul className="space-y-2 lg:hidden">
                {filtered.map((user) => (
                  <li key={user.id} className="rounded-2xl border border-sand-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">{user.full_name || '—'}</p>
                        <p className="truncate text-xs text-ink-faint" dir="ltr">
                          {user.email}
                        </p>
                        {user.phone && (
                          <p className="mt-0.5 text-xs text-ink-soft" dir="ltr">
                            {user.phone}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing(user)}
                        aria-label="تعديل"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sand-100 hover:text-ink"
                      >
                        <Icon name="edit" className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-sand-100 pt-3">
                      <UserBadges user={user} />
                      <span className="text-xs text-ink-faint">
                        {formatNumber(user.event_count)} مناسبة ·{' '}
                        {formatNumber(user.guest_count)} مدعو
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* الشاشات الأكبر: جدول */}
              <div className="hidden overflow-x-auto pk-scrollbar lg:block">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-sand-200 text-right text-xs text-ink-faint">
                      <th className="py-2.5 font-semibold">المستخدم</th>
                      <th className="py-2.5 font-semibold">الجوال</th>
                      <th className="py-2.5 font-semibold">الاستخدام</th>
                      <th className="py-2.5 font-semibold">الحالة</th>
                      <th className="py-2.5 font-semibold">آخر دخول</th>
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
                        <td className="py-3" dir="ltr">
                          {user.phone ? (
                            <a
                              href={`https://wa.me/${user.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-ink-soft transition-colors hover:text-mint-600"
                            >
                              {user.phone}
                            </a>
                          ) : (
                            <span className="text-xs text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-ink-soft">
                          {formatNumber(user.event_count)} مناسبة
                          <br />
                          {formatNumber(user.guest_count)} مدعو
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <UserBadges user={user} />
                          </div>
                        </td>
                        <td className="py-3 text-xs text-ink-soft">
                          {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : 'لم يدخل'}
                          <br />
                          <span className="text-ink-faint">سجّل {formatDate(user.created_at)}</span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditing(user)}
                              className="rounded-full bg-sand-100 px-3 py-1 text-xs font-bold text-ink-soft transition-colors hover:bg-sand-200"
                            >
                              تعديل
                            </button>
                            {user.id !== currentAdminId && (
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <p className="text-xs leading-6 text-ink-faint">
        تنبيه: بيانات التواصل شخصية. استخدامها في رسائل تسويقية يتطلب موافقة أصحابها وفق نظام
        حماية البيانات الشخصية السعودي — يُفضّل إضافة خانة موافقة صريحة عند التسجيل قبل أي حملة.
      </p>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserBadges({ user }: { user: AdminUserRow }) {
  return (
    <>
      {user.is_super_admin && <Badge tone="grape">أدمن</Badge>}
      {user.has_subscription && <Badge tone="mint">مشترك</Badge>}
      {user.is_suspended && <Badge tone="coral">موقوف</Badge>}
      {!user.email_confirmed && <Badge tone="sunny">بريد غير مؤكّد</Badge>}
    </>
  );
}

function EditUserModal({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailChanged = email.trim().toLowerCase() !== (user.email ?? '').toLowerCase();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (emailChanged && !confirm('تغيير البريد يعني أن المستخدم سيسجّل دخوله بالبريد الجديد. متأكد؟')) {
      return;
    }

    startTransition(async () => {
      const res = await adminUpdateUser(user.id, {
        fullName,
        phone: phone || null,
        ...(emailChanged ? { email } : {}),
      });

      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="تعديل بيانات المستخدم">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="الاسم" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>

        <Field
          label="البريد الإلكتروني"
          hint={emailChanged ? '⚠️ سيتغيّر بريد الدخول لهذا الحساب' : 'يُستخدم لتسجيل الدخول'}
          required
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            required
          />
        </Field>

        <Field label="رقم الجوال" hint="بصيغة دولية للتواصل عبر واتساب — مثال: 9665xxxxxxxx">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
            placeholder="9665xxxxxxxx"
          />
        </Field>

        <div className="rounded-2xl bg-sand-50 p-4 text-xs text-ink-soft">
          <p>
            المناسبات: <span className="font-bold text-ink">{formatNumber(user.event_count)}</span>{' '}
            · المدعوون: <span className="font-bold text-ink">{formatNumber(user.guest_count)}</span>
          </p>
          <p className="mt-1">
            سجّل في {formatDate(user.created_at)} · آخر دخول{' '}
            {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : 'لم يدخل بعد'}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={pending}>
            حفظ
          </Button>
        </div>
      </form>
    </Modal>
  );
}

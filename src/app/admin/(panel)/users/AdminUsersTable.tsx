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
import {
  adminGrantMembership,
  adminRevokeMembership,
  adminSetUserQuota,
  adminUpdateUser,
  setUserSuspended,
} from '@/lib/actions/admin';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils/format';
import type { AdminUserRow } from './page';

export interface PlanOption {
  id: string;
  name: string;
}

export function AdminUsersTable({
  users,
  currentAdminId,
  plans,
}: {
  users: AdminUserRow[];
  currentAdminId: string;
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'suspended' | 'subscribed' | 'admins' | 'with_phone' | 'unconfirmed' | 'marketing'
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
      if (filter === 'marketing') return user.marketing_consent;
      return true;
    });
  }, [users, query, filter]);

  const withPhone = users.filter((u) => u.phone).length;
  const active = users.filter((u) => u.event_count > 0).length;
  const marketingOptIn = users.filter((u) => u.marketing_consent).length;

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
    const header = [
      'الاسم', 'البريد', 'الجوال', 'المناسبات', 'المدعوون', 'مشترك',
      'موافق على التسويق', 'تاريخ الموافقة', 'التسجيل',
    ];
    const rows = filtered.map((u) => [
      u.full_name ?? '',
      u.email ?? '',
      u.phone ?? '',
      String(u.event_count),
      String(u.guest_count),
      u.has_subscription ? 'نعم' : 'لا',
      // عمود صريح حتى لا يُستخدم التصدير في حملة تسويقية بلا موافقة
      u.marketing_consent ? 'نعم' : 'لا',
      u.marketing_consent_at ? u.marketing_consent_at.slice(0, 10) : '',
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="إجمالي الحسابات" value={formatNumber(users.length)} tone="grape" />
        <Stat label="أنشأوا مناسبات" value={formatNumber(active)} tone="mint" />
        <Stat label="لديهم رقم جوال" value={formatNumber(withPhone)} tone="sky" />
        <Stat
          label="مشتركون"
          value={formatNumber(users.filter((u) => u.has_subscription).length)}
          tone="sunny"
        />
        <Stat label="وافقوا على التسويق" value={formatNumber(marketingOptIn)} tone="coral" />
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
              <option value="marketing">وافقوا على التسويق</option>
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
                  <li key={user.id} className="rounded-2xl border border-sand-200 bg-surface p-4">
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

      {editing && (
        <EditUserModal user={editing} plans={plans} onClose={() => setEditing(null)} />
      )}
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
      {user.marketing_consent && <Badge tone="sky">موافق تسويقياً</Badge>}
    </>
  );
}

/**
 * منح العضوية وسحبها.
 * كل الأزرار type="button" لأن اللوحة تعيش داخل نموذج تعديل البيانات،
 * وأي زر بلا نوع صريح يُرسل النموذج الخارجي بدل تنفيذ إجراءه.
 */
function MembershipPanel({ user, plans }: { user: AdminUserRow; plans: PlanOption[] }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(user.membership_plan_id ?? plans[0]?.id ?? '');
  const [months, setMonths] = useState<string>('12');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function grant() {
    setErr(null);
    setMsg(null);
    if (!planId) return setErr('اختر باقة أولاً.');

    startTransition(async () => {
      const res = await adminGrantMembership(user.id, planId, months === 'forever' ? null : Number(months));
      if (!res.ok) return setErr(res.error ?? 'تعذّر منح العضوية.');
      setMsg('تم منح العضوية.');
      router.refresh();
    });
  }

  function revoke() {
    if (!confirm(`سحب العضوية من «${user.full_name || user.email}»؟`)) return;
    setErr(null);
    setMsg(null);

    startTransition(async () => {
      const res = await adminRevokeMembership(user.id);
      if (!res.ok) return setErr(res.error ?? 'تعذّر سحب العضوية.');
      setMsg('تم سحب العضوية.');
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-sand-200 p-4">
      <h3 className="text-sm font-bold text-ink">العضوية</h3>

      {user.has_subscription ? (
        <p className="mt-2 text-xs leading-6 text-ink-soft">
          الحالية: <span className="font-bold text-ink">{user.membership_plan_name ?? '—'}</span>
          {user.membership_granted && <Badge tone="grape" className="mr-1.5">ممنوحة</Badge>}
          <br />
          {user.membership_ends_at
            ? `تنتهي في ${formatDate(user.membership_ends_at)}`
            : 'بلا تاريخ انتهاء (دائمة)'}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-faint">ما عنده عضوية فعّالة.</p>
      )}

      {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
      {msg && <Alert tone="success" className="mt-3">{msg}</Alert>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Select
          aria-label="الباقة"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="min-w-[9rem] flex-1"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>

        <Select
          aria-label="المدة"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          className="min-w-[7rem] flex-1"
        >
          <option value="1">شهر</option>
          <option value="3">٣ أشهر</option>
          <option value="6">٦ أشهر</option>
          <option value="12">سنة</option>
          <option value="forever">دائمة</option>
        </Select>
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" onClick={grant} loading={pending}>
          {user.has_subscription ? 'استبدال العضوية' : 'منح العضوية'}
        </Button>
        {user.has_subscription && (
          <Button type="button" size="sm" variant="secondary" onClick={revoke} disabled={pending}>
            سحب العضوية
          </Button>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-5 text-ink-faint">
        العضوية الفعّالة تعني مناسبات ومدعوين بلا حدود — بدون دفع.
      </p>
    </div>
  );
}

/** تحديد عدد دعوات مجانية خاص بهذا المستخدم */
function QuotaPanel({ user }: { user: AdminUserRow }) {
  const router = useRouter();
  const [value, setValue] = useState(
    user.free_quota_override === null ? '' : String(user.free_quota_override),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setErr(null);
    setMsg(null);
    const raw = value.trim();
    const quota = raw === '' ? null : Number(raw);

    if (quota !== null && (!Number.isInteger(quota) || quota < 0)) {
      return setErr('اكتب رقماً صحيحاً، أو اترك الخانة فارغة للإعداد العام.');
    }

    startTransition(async () => {
      const res = (await adminSetUserQuota(user.id, quota)) as {
        ok: boolean;
        error?: string;
        updatedEvents?: number;
      };
      if (!res.ok) return setErr(res.error ?? 'تعذّر الحفظ.');

      setMsg(
        quota === null
          ? 'رجع للإعداد العام — مناسباته القائمة ما تغيّرت.'
          : `تم. وطُبّق على ${formatNumber(res.updatedEvents ?? 0)} مناسبة قائمة غير مدفوعة.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-sand-200 p-4">
      <h3 className="text-sm font-bold text-ink">عدد الدعوات المجانية</h3>
      <p className="mt-1 text-[11px] leading-5 text-ink-faint">
        خاص بهذا المستخدم ويسبق الإعداد العام. اتركه فارغاً ليتبع الإعداد العام.
      </p>

      {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
      {msg && <Alert tone="success" className="mt-3">{msg}</Alert>}

      <div className="mt-3 flex gap-2">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="الإعداد العام"
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={save} loading={pending}>
          حفظ
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-ink-faint">
        يُطبَّق فوراً على مناسباته القائمة غير المدفوعة — وإلا ظهر له أنه يقدر
        يضيف مدعوين بينما باركوداتهم تخرج «غير مفعّلة» على الباب.
      </p>
    </div>
  );
}

function EditUserModal({
  user,
  plans,
  onClose,
}: {
  user: AdminUserRow;
  plans: PlanOption[];
  onClose: () => void;
}) {
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

        <MembershipPanel user={user} plans={plans} />
        <QuotaPanel user={user} />

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

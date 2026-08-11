'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select, Switch } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Stat } from '@/components/ui/Misc';
import {
  deleteDiscountCode,
  saveDiscountCode,
  setDiscountActive,
  type DiscountInput,
} from '@/lib/actions/admin';
import { arabicDigits, formatDate, formatNumber, formatPrice } from '@/lib/utils/format';
import type { DiscountCode, DiscountCodeStats, Plan } from '@/lib/types/database';

/** وصف الخصم بلغة صاحب المنصة لا بلغة الجدول */
function describeValue(code: DiscountCode): string {
  return code.kind === 'percent'
    ? `خصم ${arabicDigits(code.value)}٪`
    : `خصم ${formatPrice(code.value)}`;
}

function describeScope(code: DiscountCode, plans: Plan[]): string {
  if (code.plan_ids.length === 0) return 'كل الباقات';
  const names = code.plan_ids
    .map((id) => plans.find((p) => p.id === id)?.name)
    .filter(Boolean) as string[];
  return names.length > 0 ? names.join(' · ') : 'باقات محذوفة';
}

export function DiscountsManager({
  codes,
  stats,
  plans,
}: {
  codes: DiscountCode[];
  stats: DiscountCodeStats[];
  plans: Plan[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DiscountCode | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const statsById = useMemo(() => new Map(stats.map((s) => [s.id, s])), [stats]);

  const marketerCodes = codes.filter((c) => c.marketer_name);
  const owed = stats.reduce((sum, s) => sum + Number(s.total_commission_halalas ?? 0), 0);
  const totalDiscount = stats.reduce((sum, s) => sum + Number(s.total_discount_halalas ?? 0), 0);
  const totalPaid = stats.reduce((sum, s) => sum + Number(s.total_paid_halalas ?? 0), 0);

  function toggle(code: DiscountCode) {
    setError(null);
    startTransition(async () => {
      const res = await setDiscountActive(code.id, !code.is_active);
      if (!res.ok) setError(res.error ?? 'تعذّر التحديث.');
      else router.refresh();
    });
  }

  function remove(code: DiscountCode) {
    if (!confirm(`حذف الكود «${code.code}» نهائياً؟`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteDiscountCode(code.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">أكواد الخصم</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            أكواد خصم على باقات بعينها أو كلها — وأكواد للمسوّقين بعمولة محسوبة.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Icon name="plus" className="h-4 w-4" />
          كود جديد
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="الأكواد" value={formatNumber(codes.length)} tone="grape" />
        <Stat label="أكواد المسوّقين" value={formatNumber(marketerCodes.length)} tone="sky" />
        <Stat label="إجمالي الخصم الممنوح" value={formatPrice(totalDiscount)} tone="coral" />
        <Stat
          label="عمولات مستحقة"
          value={formatPrice(owed)}
          hint={totalPaid > 0 ? `من مبيعات ${formatPrice(totalPaid)}` : undefined}
          tone="sunny"
        />
      </div>

      {owed > 0 && (
        <Alert tone="info">
          العمولات محسوبة على المبلغ المدفوع فعلاً بعد الخصم. صرفها للمسوّقين يتم خارج المنصة —
          هذي أرقامها فقط.
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {codes.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="ما فيه أكواد بعد"
          description="أنشئ كود خصم لحملة تسويقية، أو كوداً لمسوّق باسمه ونسبة عمولته."
          action={<Button onClick={() => setEditing('new')}>أنشئ أول كود</Button>}
        />
      ) : (
        <div className="space-y-4">
          {codes.map((code) => (
            <CodeRow
              key={code.id}
              code={code}
              stats={statsById.get(code.id)}
              plans={plans}
              pending={pending}
              onEdit={() => setEditing(code)}
              onToggle={() => toggle(code)}
              onDelete={() => remove(code)}
            />
          ))}
        </div>
      )}

      {editing && (
        <CodeModal
          code={editing === 'new' ? null : editing}
          plans={plans}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CodeRow({
  code,
  stats,
  plans,
  pending,
  onEdit,
  onToggle,
  onDelete,
}: {
  code: DiscountCode;
  stats?: DiscountCodeStats;
  plans: Plan[];
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const expired = code.expires_at ? new Date(code.expires_at) < new Date() : false;
  const exhausted = code.max_uses !== null && code.used_count >= code.max_uses;
  const usable = code.is_active && !expired && !exhausted;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              dir="ltr"
              className="rounded-xl bg-sand-100 px-3 py-1 font-mono text-sm font-bold text-ink"
            >
              {code.code}
            </span>
            <Badge tone={usable ? 'mint' : 'sand'} dot>
              {!code.is_active ? 'موقوف' : expired ? 'منتهي' : exhausted ? 'خلص' : 'فعّال'}
            </Badge>
            {code.marketer_name && <Badge tone="sky">مسوّق: {code.marketer_name}</Badge>}
          </div>

          <p className="mt-2.5 text-sm leading-7 text-ink">
            {describeValue(code)} · {describeScope(code, plans)}
            {code.label ? ` · ${code.label}` : ''}
          </p>

          <p className="mt-1 text-xs leading-6 text-ink-faint">
            استُعمل {arabicDigits(code.used_count)}
            {code.max_uses !== null ? ` من ${arabicDigits(code.max_uses)}` : ' مرة'}
            {' · '}
            {arabicDigits(code.max_uses_per_user)} لكل مستخدم
            {code.starts_at ? ` · يبدأ ${formatDate(code.starts_at)}` : ''}
            {code.expires_at ? ` · ينتهي ${formatDate(code.expires_at)}` : ''}
          </p>

          {stats && stats.redemptions > 0 && (
            <p className="mt-2 text-xs leading-6 text-ink-soft">
              خصم ممنوح {formatPrice(Number(stats.total_discount_halalas))} · مبيعات{' '}
              {formatPrice(Number(stats.total_paid_halalas))}
              {code.commission_percent
                ? ` · عمولة ${formatPrice(Number(stats.total_commission_halalas))}`
                : ''}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-200 pt-3">
        <Button size="sm" variant="secondary" disabled={pending} onClick={onEdit}>
          تعديل
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={onToggle}>
          {code.is_active ? 'أوقفه' : 'فعّله'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-coral-600"
          disabled={pending}
          onClick={onDelete}
        >
          حذف
        </Button>
      </div>
    </Card>
  );
}

function CodeModal({
  code,
  plans,
  onClose,
}: {
  code: DiscountCode | null;
  plans: Plan[];
  onClose: () => void;
}) {
  const router = useRouter();
  const paidPlans = plans.filter((p) => p.price_halalas > 0);

  const [form, setForm] = useState<DiscountInput>({
    code: code?.code ?? '',
    label: code?.label ?? '',
    kind: code?.kind ?? 'percent',
    // الثابت مخزّن بالهللات ويُعرض بالريالات
    value: code ? (code.kind === 'fixed' ? code.value / 100 : code.value) : 10,
    planIds: code?.plan_ids ?? [],
    maxUses: code?.max_uses ?? null,
    maxUsesPerUser: code?.max_uses_per_user ?? 1,
    startsAt: code?.starts_at ? code.starts_at.slice(0, 10) : null,
    expiresAt: code?.expires_at ? code.expires_at.slice(0, 10) : null,
    isActive: code?.is_active ?? true,
    marketerName: code?.marketer_name ?? '',
    commissionPercent: code?.commission_percent ?? null,
  });

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof DiscountInput>(key: K, value: DiscountInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function togglePlan(id: string) {
    setForm((f) => ({
      ...f,
      planIds: f.planIds.includes(id) ? f.planIds.filter((p) => p !== id) : [...f.planIds, id],
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await saveDiscountCode(code?.id ?? null, form);
      if (!res.ok) return setError(res.error ?? 'تعذّر الحفظ.');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title={code ? `تعديل «${code.code}»` : 'كود خصم جديد'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="الكود" htmlFor="code" hint="يُكتب بحروف كبيرة تلقائياً — العميل يكتبه كيف ما جاء" required>
          <Input
            id="code"
            dir="ltr"
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="SUMMER25"
            maxLength={32}
            required
          />
        </Field>

        <Field label="وصف داخلي" htmlFor="label" hint="لك أنت فقط — ما يشوفه العميل">
          <Input
            id="label"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="حملة الصيف"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نوع الخصم" htmlFor="kind" required>
            <Select
              id="kind"
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as 'percent' | 'fixed')}
            >
              <option value="percent">نسبة مئوية</option>
              <option value="fixed">مبلغ ثابت</option>
            </Select>
          </Field>

          <Field
            label={form.kind === 'percent' ? 'النسبة (٪)' : 'المبلغ (ريال)'}
            htmlFor="value"
            required
          >
            <Input
              id="value"
              type="number"
              inputMode="decimal"
              min={1}
              max={form.kind === 'percent' ? 100 : undefined}
              step={form.kind === 'percent' ? 1 : 0.01}
              value={form.value}
              onChange={(e) => set('value', Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-bold text-ink">الباقات المشمولة</span>
          <p className="mb-2.5 text-[11px] leading-5 text-ink-faint">
            ما تختار شيء = الكود ينطبق على كل الباقات.
          </p>
          <div className="flex flex-wrap gap-2">
            {paidPlans.map((plan) => {
              const on = form.planIds.includes(plan.id);
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => togglePlan(plan.id)}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
                    (on
                      ? 'border-grape-500 bg-grape-50 font-bold text-grape-600'
                      : 'border-sand-300 text-ink-soft hover:bg-sand-100')
                  }
                >
                  {plan.name} — {formatPrice(plan.price_halalas)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="أقصى عدد استعمالات"
            htmlFor="max_uses"
            hint="اتركه فارغاً لبلا حد"
          >
            <Input
              id="max_uses"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.maxUses ?? ''}
              onChange={(e) => set('maxUses', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="بلا حد"
            />
          </Field>

          <Field label="لكل مستخدم" htmlFor="per_user" hint="كم مرة يستعمله الحساب الواحد" required>
            <Input
              id="per_user"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.maxUsesPerUser}
              onChange={(e) => set('maxUsesPerUser', Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="يبدأ من" htmlFor="starts_at" hint="اختياري">
            <Input
              id="starts_at"
              type="date"
              value={form.startsAt ?? ''}
              onChange={(e) => set('startsAt', e.target.value || null)}
            />
          </Field>

          <Field label="ينتهي في" htmlFor="expires_at" hint="اختياري">
            <Input
              id="expires_at"
              type="date"
              value={form.expiresAt ?? ''}
              onChange={(e) => set('expiresAt', e.target.value || null)}
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-sand-200 p-4">
          <h3 className="text-sm font-bold text-ink">كود مسوّق</h3>
          <p className="mt-1 text-[11px] leading-5 text-ink-faint">
            املأ الاسم والنسبة لو الكود لمسوّق — تُحسب عمولته على المبلغ المدفوع بعد الخصم،
            ويظهر مستحقّه في أعلى الصفحة. اتركهما فارغين لكود خصم عادي.
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="اسم المسوّق" htmlFor="marketer">
              <Input
                id="marketer"
                value={form.marketerName}
                onChange={(e) => set('marketerName', e.target.value)}
                placeholder="أبو عبدالله"
              />
            </Field>

            <Field label="نسبة العمولة (٪)" htmlFor="commission">
              <Input
                id="commission"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={form.commissionPercent ?? ''}
                onChange={(e) =>
                  set('commissionPercent', e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="١٠"
              />
            </Field>
          </div>
        </div>

        <Switch
          checked={form.isActive}
          onChange={(v) => set('isActive', v)}
          label="الكود فعّال"
          description="إيقافه يمنع الاستعمال الجديد ويُبقي سجل ما مضى."
        />

        <div className="flex gap-2 pt-1">
          <Button type="submit" loading={pending}>
            حفظ
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

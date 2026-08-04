'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { deletePlan, savePlan } from '@/lib/actions/admin';
import { billingLabel, formatPrice } from '@/lib/utils/format';
import type { Plan } from '@/lib/types/database';

export function PlansManager({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(plan: Plan) {
    if (!confirm(`حذف باقة «${plan.name}»؟ الأفضل تعطيلها بدل حذفها لو فيها مدفوعات سابقة.`))
      return;
    setError(null);
    startTransition(async () => {
      const res = await deletePlan(plan.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">الباقات والأسعار</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            تظهر في صفحة الأسعار العامة وفي صفحة الدفع داخل لوحة المستخدم.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Icon name="plus" className="h-4 w-4" />
          باقة جديدة
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title={`الباقات (${plans.length})`} />
        <CardBody>
          <div className="overflow-x-auto pk-scrollbar">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-right text-xs text-ink-faint">
                  <th className="py-2.5 font-semibold">الباقة</th>
                  <th className="py-2.5 font-semibold">السعر</th>
                  <th className="py-2.5 font-semibold">حد المدعوين</th>
                  <th className="py-2.5 font-semibold">الحالة</th>
                  <th className="w-32 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-sand-100 hover:bg-sand-50">
                    <td className="py-3">
                      <p className="font-semibold text-ink">{plan.name}</p>
                      <code dir="ltr" className="text-[11px] text-ink-faint">
                        {plan.code}
                      </code>
                    </td>
                    <td className="py-3">
                      <span className="font-bold text-ink">
                        {formatPrice(plan.price_halalas, plan.currency)}
                      </span>
                      <span className="mr-1 text-xs text-ink-faint">
                        {billingLabel(plan.billing_period)}
                      </span>
                    </td>
                    <td className="py-3 text-ink-soft">
                      {plan.guests_limit === null ? 'غير محدود' : plan.guests_limit}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={plan.is_active ? 'mint' : 'sand'}>
                          {plan.is_active ? 'فعّالة' : 'معطّلة'}
                        </Badge>
                        {plan.is_featured && <Badge tone="grape">مميّزة</Badge>}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(plan)}
                          className="rounded-full bg-sand-100 px-3 py-1 text-xs font-bold text-ink-soft transition-colors hover:bg-sand-200"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(plan)}
                          disabled={pending}
                          className="rounded-full bg-coral-50 px-3 py-1 text-xs font-bold text-coral-600 transition-colors hover:bg-coral-100"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {editing && (
        <PlanModal
          plan={editing === 'new' ? null : editing}
          nextSort={(plans.at(-1)?.sort_order ?? 0) + 10}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PlanModal({
  plan,
  nextSort,
  onClose,
}: {
  plan: Plan | null;
  nextSort: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(plan?.code ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  // السعر يُعرض بالريال للأدمن ويُخزَّن بالهللات
  const [priceRiyals, setPriceRiyals] = useState((plan?.price_halalas ?? 0) / 100);
  const [billingPeriod, setBillingPeriod] = useState(plan?.billing_period ?? 'one_time');
  const [unlimited, setUnlimited] = useState(plan ? plan.guests_limit === null : false);
  const [guestsLimit, setGuestsLimit] = useState(plan?.guests_limit ?? 200);
  const [features, setFeatures] = useState((plan?.features ?? []).join('\n'));
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(plan?.is_featured ?? false);
  const [sortOrder, setSortOrder] = useState(plan?.sort_order ?? nextSort);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await savePlan({
        id: plan?.id,
        code,
        name,
        description: description.trim() || null,
        priceHalalas: Math.round(priceRiyals * 100),
        billingPeriod,
        guestsLimit: unlimited ? null : guestsLimit,
        features: features
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean),
        isActive,
        isFeatured,
        sortOrder,
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
    <Modal open onClose={onClose} title={plan ? 'تعديل الباقة' : 'باقة جديدة'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الباقة" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="الرمز" hint="إنجليزي — لا يُعرض للمستخدم" required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              dir="ltr"
              required
            />
          </Field>
        </div>

        <Field label="الوصف">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="السعر (ريال)" hint="شامل الضريبة" required>
            <Input
              type="number"
              min={0}
              step={1}
              value={priceRiyals}
              onChange={(e) => setPriceRiyals(Number(e.target.value))}
              dir="ltr"
              required
            />
          </Field>
          <Field label="نوع الفوترة" required>
            <Select
              value={billingPeriod}
              onChange={(e) => setBillingPeriod(e.target.value as typeof billingPeriod)}
            >
              <option value="one_time">دفعة واحدة</option>
              <option value="monthly">اشتراك شهري</option>
              <option value="yearly">اشتراك سنوي</option>
            </Select>
          </Field>
        </div>

        <Switch
          checked={unlimited}
          onChange={setUnlimited}
          label="مدعوون غير محدودين"
          description="أطفئه لتحديد حد أقصى لعدد المدعوين."
        />

        {!unlimited && (
          <Field label="الحد الأقصى للمدعوين" required>
            <Input
              type="number"
              min={1}
              value={guestsLimit}
              onChange={(e) => setGuestsLimit(Number(e.target.value))}
              dir="ltr"
            />
          </Field>
        )}

        <Field label="المميزات" hint="كل ميزة في سطر مستقل">
          <Textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={6} />
        </Field>

        <Field label="ترتيب العرض">
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            dir="ltr"
          />
        </Field>

        <Switch checked={isActive} onChange={setIsActive} label="الباقة معروضة للبيع" />
        <Switch
          checked={isFeatured}
          onChange={setIsFeatured}
          label="باقة مميّزة"
          description="تظهر بإطار بارز وشارة «الأكثر طلباً»."
        />

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

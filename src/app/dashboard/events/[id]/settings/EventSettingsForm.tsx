'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { deleteEvent, updateEventDetails, type ActionResult } from '@/lib/actions/events';
import { ActivationControl } from './ActivationControl';
import { EVENT_TYPES } from '@/lib/design/defaults';
import { formatDateTime, toLocalInputValue } from '@/lib/utils/format';
import { activationMoment, expiryMoment } from '@/lib/utils/event-phase';
import type { EventRow } from '@/lib/types/database';

export function EventSettingsForm({
  event,
  guestCount,
  guestLimit,
}: {
  event: EventRow;
  guestCount: number;
  guestLimit: number | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateEventDetails,
    null,
  );
  const [deleting, startDelete] = useTransition();

  const [lead, setLead] = useState(event.activation_lead_minutes);
  const [grace, setGrace] = useState(event.expiry_grace_minutes);

  /*
   * الدعوات المجانية تُحسب على الحساب مرة واحدة ولا ترجع بالحذف. من
   * يحذف مناسبة ظنّاً أنه يستعيد حصته يفاجأ بعدها — فنقولها قبل الحذف
   * لا بعده.
   */
  const freeSpent = !event.is_paid && !event.is_demo && guestCount > 0;

  function remove() {
    if (
      !confirm(
        `سيُحذف «${event.title}» نهائياً مع كل المدعوين والباركودات وسجل المسح وحسابات المسؤولين. ` +
          (freeSpent ? 'والدعوات المجانية اللي استهلكتها ما ترجع بالحذف. ' : '') +
          'هذا الإجراء لا يمكن التراجع عنه. متأكد؟',
      )
    )
      return;

    startDelete(async () => {
      await deleteEvent(event.id);
      router.push('/dashboard');
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="بيانات المناسبة" />
        <CardBody>
          {state?.error && (
            <Alert tone="danger" className="mb-4">
              {state.error}
            </Alert>
          )}
          {state?.ok && (
            <Alert tone="success" className="mb-4">
              تم حفظ التعديلات.
            </Alert>
          )}

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="id" value={event.id} />

            <Field label="اسم المناسبة" htmlFor="title" required>
              <Input id="title" name="title" defaultValue={event.title} required />
            </Field>

            <Field label="نوع المناسبة" htmlFor="event_type" required>
              <Select id="event_type" name="event_type" defaultValue={event.event_type}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.emoji} {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="بداية المناسبة"
                htmlFor="starts_at"
                hint="التاريخ والوقت — اضغط أيقونة التقويم"
                required
              >
                <DateTimeInput
                  id="starts_at"
                  name="starts_at"
                  defaultValue={toLocalInputValue(event.starts_at)}
                  required
                />
              </Field>
              <Field label="نهاية المناسبة" htmlFor="ends_at" hint="اختياري — الافتراضي ٦ ساعات بعد البداية">
                <DateTimeInput
                  id="ends_at"
                  name="ends_at"
                  defaultValue={toLocalInputValue(event.ends_at)}
                />
              </Field>
            </div>

            <Field label="الموقع" htmlFor="venue">
              <Input id="venue" name="venue" defaultValue={event.venue ?? ''} />
            </Field>

            <Field
              label="رابط الموقع على الخريطة"
              htmlFor="map_url"
              hint="اختياري — انسخه من خرائط جوجل. يظهر للمدعو كزر يفتح الخريطة."
            >
              <Input
                id="map_url"
                name="map_url"
                type="url"
                dir="ltr"
                placeholder="https://maps.app.goo.gl/…"
                defaultValue={event.map_url ?? ''}
              />
            </Field>

            <Field label="ملاحظات داخلية" htmlFor="notes" hint="تظهر لك فقط">
              <Textarea id="notes" name="notes" defaultValue={event.notes ?? ''} rows={3} />
            </Field>

            <Field
              label="ملاحظة تظهر للمدعوين"
              htmlFor="guest_note"
              hint="تظهر في صفحة الدعوة — زي: يُرجى الحضور قبل الموعد بنصف ساعة"
            >
              <Textarea
                id="guest_note"
                name="guest_note"
                defaultValue={event.guest_note ?? ''}
                maxLength={400}
                rows={2}
              />
            </Field>

            <RsvpSwitch defaultOn={event.rsvp_enabled} />

            <div className="border-t border-sand-200 pt-5">
              <h3 className="text-sm font-bold text-ink">نافذة صلاحية الباركودات</h3>
              <p className="mt-1 text-xs leading-6 text-ink-soft">
                تُدار بالكامل على الخادم — لا تتأثر بساعة جهاز المسح.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="تفعيل قبل البداية بـ (دقيقة)" htmlFor="lead" hint="الافتراضي ١٥ دقيقة">
                  <Input
                    id="lead"
                    name="activation_lead_minutes"
                    type="number"
                    min={0}
                    max={10080}
                    value={lead}
                    onChange={(e) => setLead(Number(e.target.value))}
                  />
                </Field>
                <Field label="انتهاء بعد النهاية بـ (دقيقة)" htmlFor="grace" hint="الافتراضي ١٤٤٠ = اليوم التالي">
                  <Input
                    id="grace"
                    name="expiry_grace_minutes"
                    type="number"
                    min={0}
                    max={20160}
                    value={grace}
                    onChange={(e) => setGrace(Number(e.target.value))}
                  />
                </Field>
              </div>

              <div className="mt-4 space-y-1 rounded-2xl bg-sand-50 p-4 text-xs text-ink-soft">
                <p>
                  تتفعّل الباركودات:{' '}
                  <span className="font-bold text-ink">
                    {formatDateTime(activationMoment({ ...event, activation_lead_minutes: lead }))}
                  </span>
                </p>
                <p>
                  تنتهي صلاحيتها:{' '}
                  <span className="font-bold text-ink">
                    {formatDateTime(expiryMoment({ ...event, expiry_grace_minutes: grace }))}
                  </span>
                </p>
              </div>
            </div>

            <Button type="submit" size="lg" loading={pending}>
              حفظ التعديلات
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="حالة الباركودات الآن"
          description="تجاوز التوقيت التلقائي يدوياً — يفيد لو بدأت المناسبة مبكراً أو تأخرت."
        />
        <CardBody>
          <ActivationControl event={event} guestCount={guestCount} guestLimit={guestLimit} />
        </CardBody>
      </Card>

      <Card className="border-coral-100">
        <CardHeader
          title="حذف المناسبة"
          description="يحذف المدعوين والباركودات وسجل المسح وحسابات المسؤولين. لا يمكن التراجع."
        />
        <CardBody>
          {freeSpent && (
            <Alert tone="warning" className="mb-4">
              الدعوات المجانية اللي استهلكتها محسوبة على حسابك مرة واحدة — ما ترجع لك بحذف
              المناسبة.
            </Alert>
          )}
          <Button variant="danger" onClick={remove} loading={deleting}>
            حذف المناسبة نهائياً
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * مفتاح تأكيد الحضور.
 *
 * والفرق بين وضعيه ليس في الشكل بل في مكان الباركود، ومكان الباركود
 * يقرّر ما يُرسَل:
 *
 *   مطفأ    باركود كل مدعو محروق داخل صورته. أي أن لكل مدعوٍّ صورة —
 *           وهذا ما يجعل الدعوة تُطبع وتُرسل يدوياً، ويجعل الإرسال
 *           الآليّ لخمسمئة مدعو خمسمئة رفعٍ للصور.
 *
 *   مفعّل   صورة واحدة للجميع بلا باركود، ولكل مدعوٍّ رابط. والباركود
 *           لا يُولَّد له إلا بعد أن يؤكّد.
 *
 * ومكتوبٌ هنا صراحةً لأن اللافتة وحدها («تأكيد الحضور») لا تُفهم منها
 * هذه التبعات، فيُفعّله صاحب مناسبةٍ طبع دعواته أمس.
 */
function RsvpSwitch({ defaultOn }: { defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);

  return (
    <div className="border-t border-sand-200 pt-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="rsvp_enabled"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-grape-500"
        />
        <span>
          <span className="block text-sm font-bold text-ink">
            تأكيد الحضور (RSVP)
          </span>
          <span className="mt-1 block text-xs leading-6 text-ink-soft">
            المدعو يفتح رابطه، يشوف الدعوة، ويرد: أحضر أو أعتذر. وباركوده ما يطلع
            له إلا بعد ما يأكّد.
          </span>
        </span>
      </label>

      <div className="mt-3 rounded-2xl bg-sand-50 p-4 text-xs leading-6 text-ink-soft">
        {on ? (
          <>
            <p className="font-bold text-ink">وش يتغيّر لما تفعّله:</p>
            <ul className="mt-1 list-disc space-y-1 pe-4">
              <li>الباركود ينتقل من داخل الصورة إلى صفحة الدعوة.</li>
              <li>الصورة تصير وحدة للكل — تقدر ترسلها لأي عدد بدون تكرار.</li>
              <li>لكل مدعو رابط خاص فيه، تنسخه أو ترسله من صفحة المدعوين.</li>
              <li>تعرف مين بيحضر ومين اعتذر قبل المناسبة بأيام.</li>
            </ul>
          </>
        ) : (
          <>
            <p className="font-bold text-ink">الوضع الحالي (بدون تأكيد):</p>
            <ul className="mt-1 list-disc space-y-1 pe-4">
              <li>باركود كل مدعو داخل صورته، وتنزّلها كلها ملف واحد.</li>
              <li>مناسب للدعوات المطبوعة، وللي يرسل بنفسه من جواله.</li>
              <li>ما فيه صفحة رد، فما تعرف مين بيحضر إلا يوم المناسبة.</li>
            </ul>
          </>
        )}
      </div>

      {on !== defaultOn && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
          {on
            ? 'انتبه: لو كنت نزّلت الدعوات قبل شوي، الباركودات اللي فيها بتبقى شغّالة — بس المدعوين اللي ما استلموها لازم يمرّون على صفحة التأكيد.'
            : 'انتبه: بإطفائه تُهمل ردود المدعوين، ويرجع الباركود داخل الصورة — ولازم تنزّل الدعوات من جديد.'}
        </p>
      )}
    </div>
  );
}

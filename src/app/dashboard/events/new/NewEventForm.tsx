'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { createEvent, type ActionResult } from '@/lib/actions/events';
import { EVENT_TYPES, SUGGESTED_TAGS } from '@/lib/design/defaults';
import { cn } from '@/lib/utils/cn';

export function NewEventForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createEvent,
    null,
  );
  const [eventType, setEventType] = useState<string>('wedding');

  const suggested = SUGGESTED_TAGS[eventType] ?? [];

  return (
    <Card className="mt-6 p-6 sm:p-7">
      {state?.error && (
        <Alert tone="danger" className="mb-5">
          {state.error}
        </Alert>
      )}

      <form action={formAction} className="space-y-5">
        <Field label="اسم المناسبة" htmlFor="title" required>
          <Input id="title" name="title" required placeholder="مثال: حفل زواج عبدالله ونورة" />
        </Field>

        <div className="space-y-2">
          <span className="block text-sm font-semibold text-ink">
            نوع المناسبة <span className="text-coral-500">*</span>
          </span>
          <input type="hidden" name="event_type" value={eventType} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setEventType(t.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition-all duration-200',
                  eventType === t.value
                    ? 'border-grape-400 bg-grape-50 shadow-soft'
                    : 'border-sand-200 bg-surface hover:border-sand-300',
                )}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    eventType === t.value ? 'text-grape-600' : 'text-ink-soft',
                  )}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
          {suggested.length > 0 && (
            <p className="text-xs text-ink-faint">
              سننشئ لك فئات مقترحة تلقائياً:{' '}
              <span className="font-semibold text-ink-soft">
                {suggested.map((t) => t.name).join('، ')}
              </span>{' '}
              — تقدر تعدّلها أو تحذفها لاحقاً.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="بداية المناسبة"
            htmlFor="starts_at"
            hint="التاريخ والوقت — اضغط أيقونة التقويم"
            required
          >
            <DateTimeInput id="starts_at" name="starts_at" minNow required />
          </Field>
          <Field
            label="نهاية المناسبة"
            htmlFor="ends_at"
            hint="اختياري — الافتراضي ٦ ساعات بعد البداية"
          >
            <DateTimeInput id="ends_at" name="ends_at" minNow />
          </Field>
        </div>

        <Field label="الموقع" htmlFor="venue" hint="اسم القاعة أو العنوان">
          <Input id="venue" name="venue" placeholder="مثال: قاعة الماسة — طريق الملك فهد، الرياض" />
        </Field>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" size="lg" loading={pending}>
            التالي: تصميم الدعوة
          </Button>
        </div>
      </form>
    </Card>
  );
}

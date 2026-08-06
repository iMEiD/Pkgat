'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { SUGGESTION_CATEGORIES, submitSuggestion } from '@/lib/actions/suggestions';
import type { ActionResult } from '@/lib/actions/events';

export function SuggestForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitSuggestion,
    null,
  );

  return (
    <Card>
      <CardHeader
        title="اقترح تحسيناً"
        description="ملاحظاتك تصل مباشرة لفريق بكجات — وهي أسرع طريقة يتحسّن بها الموقع."
      />
      <CardBody>
        {state?.ok && (
          <Alert tone="success" className="mb-4" title="وصلنا اقتراحك">
            شكراً لك. نقرأ كل اقتراح، وإذا احتجنا تفصيلاً بنتواصل معك على بريدك أو جوالك.
          </Alert>
        )}
        {state?.error && (
          <Alert tone="danger" className="mb-4">
            {state.error}
          </Alert>
        )}

        <form action={formAction} className="space-y-4">
          <Field label="نوع الملاحظة" htmlFor="category" required>
            <Select id="category" name="category" defaultValue="feature">
              {SUGGESTION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="اكتب ملاحظتك"
            htmlFor="message"
            hint="كل ما كنت محدداً، كل ما قدرنا نساعدك أسرع"
            required
          >
            <Textarea
              id="message"
              name="message"
              rows={7}
              required
              minLength={10}
              maxLength={4000}
              placeholder="مثال: أبغى أقدر أرسل الدعوات واتساب مباشرة من الموقع بدل ما أحمّلها وأرسلها واحدة واحدة."
            />
          </Field>

          <div className="rounded-2xl bg-sand-50 p-4 text-xs leading-6 text-ink-soft">
            سيُرفق اسمك وبريدك وجوالك مع الاقتراح حتى نقدر نرد عليك. لا تُستخدم هذه
            البيانات لأي غرض آخر.
          </div>

          <Button type="submit" size="lg" loading={pending}>
            إرسال الاقتراح
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

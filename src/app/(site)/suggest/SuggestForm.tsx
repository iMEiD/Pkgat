'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { submitSuggestion } from '@/lib/actions/suggestions';
import { SUGGESTION_CATEGORIES } from '@/lib/suggestions-meta';
import type { ActionResult } from '@/lib/actions/events';

export function SuggestForm({
  signedIn,
  knownName,
}: {
  signedIn: boolean;
  knownName: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitSuggestion,
    null,
  );

  return (
    <Card>
      <CardBody>
        {state?.ok && (
          <Alert tone="success" className="mb-4" title="وصلنا اقتراحك">
            شكراً لك. نقرأ كل اقتراح، وإذا احتجنا تفصيلاً بنتواصل معك.
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

          {/* الزائر يكتب بياناته؛ المسجّل تُؤخذ من ملفه فلا نسأله مرتين */}
          {!signedIn && (
            <>
              <Field label="اسمك" htmlFor="name" required>
                <Input id="name" name="name" required placeholder="اسمك" autoComplete="name" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="البريد الإلكتروني" htmlFor="email" hint="أو اكتب جوالك">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    dir="ltr"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </Field>
                <Field label="رقم الجوال" htmlFor="phone" hint="بصيغة دولية">
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="966512345678"
                    autoComplete="tel"
                  />
                </Field>
              </div>
            </>
          )}

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
            {signedIn ? (
              <>
                سيُرفق اسمك وبريدك وجوالك من حسابك
                {knownName ? ` (${knownName})` : ''} مع الاقتراح حتى نقدر نرد عليك.
              </>
            ) : (
              <>نحتاج بريدك أو جوالك — أحدهما يكفي — حتى نقدر نرد عليك.</>
            )}{' '}
            لا تُستخدم هذه البيانات لأي غرض آخر.
          </div>

          <Button type="submit" size="lg" loading={pending}>
            إرسال الاقتراح
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

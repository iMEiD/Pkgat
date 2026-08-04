'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    // نعرض نفس الرسالة دائماً حتى لا نكشف البُرد المسجّلة
    setLoading(false);
    setSent(true);
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="font-display text-2xl font-bold text-ink">استعادة كلمة المرور</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        أدخل بريدك وسنرسل لك رابط إعادة تعيين كلمة المرور.
      </p>

      {sent ? (
        <Alert tone="success" className="mt-6" title="تم الإرسال">
          إذا كان هذا البريد مسجّلاً لدينا، فستصلك رسالة تحتوي رابط إعادة التعيين خلال دقائق.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="البريد الإلكتروني" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            أرسل رابط الاستعادة
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-bold text-grape-600 hover:text-grape-700">
          العودة لتسجيل الدخول
        </Link>
      </p>
    </Card>
  );
}

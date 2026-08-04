'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون ٨ أحرف على الأقل.');
      return;
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(
        authError.message.includes('already registered')
          ? 'هذا البريد مسجّل مسبقاً. جرّب تسجيل الدخول.'
          : 'تعذّر إنشاء الحساب. تأكد من صحة البريد وحاول مرة أخرى.',
      );
      return;
    }

    // إن كان تأكيد البريد مُعطّلاً في المشروع، تُنشأ الجلسة مباشرة
    if (data.session) {
      router.push('/dashboard');
      router.refresh();
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-mint-50 text-3xl">
          ✉️
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">فعّل بريدك</h1>
        <p className="mt-3 text-sm leading-8 text-ink-soft">
          أرسلنا رابط تأكيد إلى <span className="font-bold text-ink" dir="ltr">{email}</span>.
          <br />
          افتح الرابط لتفعيل حسابك، ثم سجّل دخولك.
        </p>
        <Link
          href="/login?registered=1"
          className="mt-6 inline-block text-sm font-bold text-grape-600 hover:text-grape-700"
        >
          الذهاب لصفحة الدخول ←
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="font-display text-2xl font-bold text-ink">أنشئ حسابك</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        أول ١٠ دعوات في كل مناسبة مجاناً — بدون بطاقة.
      </p>

      {error && (
        <Alert tone="danger" className="mt-5">
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="الاسم" htmlFor="name" required>
          <Input
            id="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="اسمك الكامل"
            autoComplete="name"
          />
        </Field>

        <Field label="البريد الإلكتروني" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>

        <Field label="كلمة المرور" htmlFor="password" hint="٨ أحرف على الأقل" required>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>

        <Field label="تأكيد كلمة المرور" htmlFor="confirm" required>
          <Input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          إنشاء الحساب
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        عندك حساب؟{' '}
        <Link href="/login" className="font-bold text-grape-600 hover:text-grape-700">
          سجّل دخولك
        </Link>
      </p>
    </Card>
  );
}

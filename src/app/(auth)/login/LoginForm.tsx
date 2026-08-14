'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';

/**
 * أسباب سقوط رابط البريد — كان المستخدم يُعاد لصفحة الدخول بلا كلمة
 * واحدة تشرح، فيظنّ الرابط «لا يعمل».
 */
const LINK_ERRORS: Record<string, string> = {
  expired: 'انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً من «نسيت كلمة المرور».',
  device:
    'افتح الرابط في نفس المتصفح الذي طلبته منه. أو اطلب رابطاً جديداً من هذا المتصفح.',
  invalid: 'الرابط غير مكتمل. انسخه كاملاً من الرسالة، أو اطلب رابطاً جديداً.',
  auth: 'تعذّر إكمال العملية. اطلب رابطاً جديداً.',
};

/**
 * تأكيدٌ نجح ودخولٌ لم يكتمل.
 *
 * وصول المستخدم إلى هنا بـ`confirmed` يعني أن Supabase تحقّق من رمز
 * البريد فعلاً — فحسابه مفعّل — وأن الفاشل هو فتح الجلسة تلقائياً.
 * عرض ذلك كـ«الرابط لم يعمل» يُفزع من تأكّد حسابه ويدفعه لإعادة
 * التسجيل، وهو أسوأ من الخلل نفسه.
 */
const CONFIRMED_NOTICE = 'تم تأكيد بريدك بنجاح ✅ سجّل دخولك الآن بنفس البريد وكلمة المرور.';

export function LoginForm({
  nextPath,
  justRegistered,
  linkError,
}: {
  nextPath?: string;
  justRegistered?: boolean;
  linkError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // يظهر خيار إعادة الإرسال فقط حين يكون البريد غير مؤكَّد فعلاً
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setLoading(false);
      const unconfirmed = authError.message.includes('Email not confirmed');
      setNeedsConfirm(unconfirmed);
      setError(
        unconfirmed
          ? 'لم يتم تفعيل بريدك بعد. افتح رابط التأكيد المُرسل إليك، أو أعد إرساله من الأسفل.'
          : 'البريد أو كلمة المرور غير صحيحة.',
      );
      return;
    }

    router.push(nextPath || '/dashboard');
    router.refresh();
  }

  async function resendConfirmation() {
    setResending(true);
    const supabase = createClient();
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    setResending(false);
    setResent(true);
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="font-display text-2xl font-bold text-ink">أهلاً بعودتك</h1>
      <p className="mt-1.5 text-sm text-ink-soft">سجّل دخولك لإدارة مناسباتك ودعواتك.</p>

      {justRegistered && (
        <Alert tone="success" className="mt-5" title="تم إنشاء حسابك">
          أرسلنا رابط تأكيد إلى بريدك. فعّل حسابك ثم سجّل دخولك من هنا.
        </Alert>
      )}

      {linkError === 'confirmed' ? (
        <Alert tone="success" className="mt-5" title="تم تفعيل حسابك">
          {CONFIRMED_NOTICE}
        </Alert>
      ) : (
        linkError && (
          <Alert tone="warning" className="mt-5" title="الرابط لم يعمل">
            {LINK_ERRORS[linkError] ?? LINK_ERRORS.auth}{' '}
            <Link href="/forgot-password" className="font-bold underline underline-offset-4">
              اطلب رابطاً جديداً
            </Link>
          </Alert>
        )
      )}

      {error && (
        <Alert
          tone="danger"
          className="mt-5"
          action={
            needsConfirm && !resent ? (
              <Button size="sm" variant="secondary" onClick={resendConfirmation} loading={resending}>
                أعد إرسال رابط التفعيل
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}

      {resent && (
        <Alert tone="success" className="mt-5" title="أُرسل الرابط">
          افحص بريدك — وتحقق من مجلد الرسائل غير المرغوبة (Spam) إن لم يصل خلال دقيقة.
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="البريد الإلكتروني" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="كلمة المرور" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="pk-tap text-xs font-semibold text-grape-600 transition-colors hover:text-grape-700"
          >
            نسيت كلمة المرور؟
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          دخول
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        ما عندك حساب؟{' '}
        <Link href="/signup" className="pk-tap font-bold text-grape-600 hover:text-grape-700">
          أنشئ حساب جديد
        </Link>
      </p>

      <div className="mt-6 border-t border-sand-200 pt-5 text-center">
        <Link
          href="/scan/login"
          className="pk-tap text-xs font-semibold text-ink-faint transition-colors hover:text-ink"
        >
          مسؤول استقبال؟ ادخل من هنا ←
        </Link>
      </div>
    </Card>
  );
}

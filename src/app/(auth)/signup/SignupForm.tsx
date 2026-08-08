'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';
import { COUNTRIES, DEFAULT_COUNTRY, buildPhone, findCountry } from '@/lib/countries';
import { isPhoneTaken } from '@/lib/actions/phone';

/**
 * ترجمة أخطاء التسجيل لرسائل تدلّ على السبب الحقيقي.
 *
 * كانت كل الأخطاء تُعرض «تأكد من صحة البريد» — وهي رسالة مضلّلة حين
 * يكون البريد سليماً تماماً وإنما فشل *إرسال* رسالة التفعيل (خطأ SMTP).
 * المستخدم يظل يجرّب بريداً بعد بريد بلا فائدة، والسبب ليس عنده.
 */
function signupErrorMessage(raw: string): string {
  const message = raw.toLowerCase();

  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'هذا البريد مسجّل مسبقاً. جرّب تسجيل الدخول.';
  }
  if (message.includes('sending') || message.includes('smtp') || message.includes('email')) {
    return 'تعذّر إرسال رسالة التفعيل — الخلل عندنا لا في بريدك. تواصل مع الدعم.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'محاولات كثيرة في وقت قصير. انتظر دقيقة وحاول مرة أخرى.';
  }
  if (message.includes('duplicate') || message.includes('unique') || message.includes('saving new user')) {
    return 'رقم الجوال أو البريد مسجّل في حساب آخر. جرّب غيره أو سجّل دخولك.';
  }
  if (message.includes('password')) {
    return 'كلمة المرور ضعيفة أو غير مقبولة. جرّب كلمة أطول.';
  }
  if (message.includes('invalid') && message.includes('email')) {
    return 'صيغة البريد غير صحيحة.';
  }
  return 'تعذّر إنشاء الحساب. حاول مرة أخرى، وإذا تكرر تواصل مع الدعم.';
}

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // موافقتان منفصلتان: قبول الشروط شرط للتسجيل، والاستخدام التسويقي اختياري
  // ولا يجوز أن يكون مؤشَّراً مسبقاً — نظام حماية البيانات الشخصية يشترط
  // أن تكون الموافقة التسويقية صريحة ومنفصلة.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const phoneResult = buildPhone(country, localPhone);
    if (!phoneResult.ok) {
      setError(phoneResult.error);
      return;
    }

    // فحص مسبق ليرى المستخدم سبباً مفهوماً بدل خطأ قاعدة البيانات
    setLoading(true);
    if (await isPhoneTaken(phoneResult.phone)) {
      setLoading(false);
      setError('رقم الجوال هذا مسجّل في حساب آخر. استخدم رقماً غيره أو سجّل دخولك.');
      return;
    }
    setLoading(false);

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون ٨ أحرف على الأقل.');
      return;
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (!acceptedTerms) {
      setError('لازم توافق على الشروط وسياسة الخصوصية قبل إنشاء الحساب.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phoneResult.phone,
          marketing_consent: marketingConsent,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(signupErrorMessage(authError.message));
      return;
    }

    // Supabase لا يكشف أن البريد مسجّل مسبقاً — يرجع مستخدماً وهمياً بلا
    // هويات (identities فارغة) بدل رسالة خطأ، منعاً لتعداد البُرد. بدون
    // هذا الفحص نعرض «تفقّد بريدك» لشخص لن يصله شيء أبداً.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError('هذا البريد مسجّل مسبقاً. جرّب تسجيل الدخول أو استعادة كلمة المرور.');
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

        <Field
          label="رقم الجوال"
          htmlFor="phone"
          hint={`اختر دولتك ثم اكتب الرقم بدون الصفر — مثال: ${
            findCountry(country).code === 'SA' ? '512345678' : 'رقمك المحلي'
          }`}
          required
        >
          <div className="flex gap-2" dir="ltr">
            <Select
              aria-label="مفتاح الدولة"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-[8.5rem] shrink-0 px-3 text-center"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} +{c.dial}
                </option>
              ))}
            </Select>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              required
              dir="ltr"
              value={localPhone}
              onChange={(e) => setLocalPhone(e.target.value)}
              placeholder="512345678"
              autoComplete="tel-national"
              className="flex-1"
            />
          </div>
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

        <div className="space-y-3 rounded-2xl bg-sand-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-grape-500"
            />
            <span className="text-[13px] leading-6 text-ink-soft">
              أوافق على{' '}
              <Link href="/terms" target="_blank" className="font-bold text-grape-600 hover:text-grape-700">
                الشروط والأحكام
              </Link>{' '}
              و
              <Link href="/privacy" target="_blank" className="font-bold text-grape-600 hover:text-grape-700">
                سياسة الخصوصية
              </Link>
              <span className="text-coral-500"> *</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-grape-500"
            />
            <span className="text-[13px] leading-6 text-ink-soft">
              أوافق على وصول عروض وتحديثات بكجات على بريدي{' '}
              <span className="text-ink-faint">(اختياري — تقدر توقفه في أي وقت)</span>
            </span>
          </label>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          إنشاء الحساب
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        عندك حساب؟{' '}
        <Link href="/login" className="pk-tap font-bold text-grape-600 hover:text-grape-700">
          سجّل دخولك
        </Link>
      </p>
    </Card>
  );
}

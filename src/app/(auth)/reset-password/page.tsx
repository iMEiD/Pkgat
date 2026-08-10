'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';

/** هل وصلت الجلسة فعلاً من رابط البريد؟ */
type LinkState = 'checking' | 'ready' | 'broken';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<LinkState>('checking');

  /*
   * تدفّق implicit يضع الرمز بعد # في العنوان، فلا يصل الخادم إطلاقاً —
   * ولهذا لا يستطيع /auth/callback معالجته. نلتقطه هنا في المتصفح.
   *
   * وبدون هذا الفحص كان المستخدم يكتب كلمة مرور جديدة كاملة ثم يُفاجأ
   * بالفشل عند الحفظ.
   */
  useEffect(() => {
    const supabase = createClient();

    async function resolve() {
      const { data } = await supabase.auth.getSession();
      if (data.session) return setLink('ready');

      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!setErr) {
          // ننظّف العنوان حتى لا يبقى الرمز في سجل المتصفح
          window.history.replaceState(null, '', window.location.pathname);
          return setLink('ready');
        }
      }

      setLink('broken');
    }

    void resolve();
  }, []);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('انتهت صلاحية رابط الاستعادة. اطلب رابطاً جديداً.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  if (link === 'checking') {
    return (
      <Card className="p-7 text-center text-sm text-ink-soft sm:p-8">جارٍ التحقق من الرابط…</Card>
    );
  }

  if (link === 'broken') {
    return (
      <Card className="p-7 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-ink">الرابط لم يعد صالحاً</h1>
        <Alert tone="warning" className="mt-5">
          روابط الاستعادة تنتهي بعد مدة قصيرة، وتصلح لمرة واحدة. اطلب رابطاً جديداً وافتحه من
          نفس المتصفح.
        </Alert>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-grape-500 px-6 font-bold text-white transition-colors hover:bg-grape-600"
        >
          اطلب رابطاً جديداً
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="font-display text-2xl font-bold text-ink">كلمة مرور جديدة</h1>
      <p className="mt-1.5 text-sm text-ink-soft">اختر كلمة مرور جديدة لحسابك.</p>

      {error && (
        <Alert tone="danger" className="mt-5">
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="كلمة المرور الجديدة" htmlFor="password" hint="٨ أحرف على الأقل" required>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" fullWidth size="lg" loading={loading}>
          حفظ كلمة المرور
        </Button>
      </form>
    </Card>
  );
}

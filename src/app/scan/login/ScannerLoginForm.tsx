'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { LogoMark } from '@/components/ui/Logo';

export function ScannerLoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/scan/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      // لا نفترض أن الرد JSON دائماً: خطأ خادم غير متوقّع يرجع HTML،
      // وتحليله كان يرمي استثناءً فتظهر رسالة «تعذّر الاتصال» المضلِّلة.
      let data: { ok?: boolean; error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        setError(
          data?.error ??
            (res.status >= 500
              ? `خطأ في الخادم (${res.status}). لوحة المسح غير مهيّأة — راجع صاحب المناسبة.`
              : 'تعذّر تسجيل الدخول'),
        );
        setLoading(false);
        return;
      }

      router.push('/scan');
      router.refresh();
    } catch {
      setError('تعذّر الوصول للخادم. تأكد من اتصال الإنترنت وحاول مرة أخرى.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-14 rounded-3xl" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">لوحة مسح الدعوات</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            سجّل دخولك بالبيانات اللي وصلتك من صاحب المناسبة.
          </p>
        </div>

        <Card className="p-6">
          {/* سبب وصوله هنا وهو يظن نفسه داخلاً — يُقال أولاً */}
          {notice && !error && (
            <Alert tone="warning" className="mb-4">
              {notice}
            </Alert>
          )}

          {error && (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="اسم المستخدم" required>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                dir="ltr"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
                autoFocus
              />
            </Field>

            <Field label="كلمة المرور" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                autoComplete="current-password"
                required
              />
            </Field>

            <Button type="submit" fullWidth size="lg" loading={loading}>
              دخول
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-ink-faint">
          هذه الصفحة لمسؤولي الاستقبال فقط.
          <br />
          صاحب المناسبة يدخل من{' '}
          <a href="/login" className="pk-tap font-bold text-grape-600">
            صفحة الدخول الرئيسية
          </a>
          .
        </p>
      </div>
    </div>
  );
}

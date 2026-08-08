'use client';

import { useRouter } from 'next/navigation';
import { FloatingThemeToggle } from '@/components/ui/ThemeToggle';
import { useEffect, useState, useTransition } from 'react';
import QRCode from 'qrcode';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { LogoMark } from '@/components/ui/Logo';
import { beginTotpSetup, verifyTotp } from '@/lib/actions/admin';

export function AdminVerifyForm({ alreadyEnabled }: { alreadyEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'verify' | 'setup'>(alreadyEnabled ? 'verify' : 'setup');
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // نبدأ التهيئة تلقائياً لو ما كان التحقق مفعّلاً بعد
  useEffect(() => {
    if (alreadyEnabled) return;

    startTransition(async () => {
      const res = await beginTotpSetup();
      if (!res.ok || !res.uri) {
        setError(res.error ?? 'تعذّرت التهيئة.');
        return;
      }
      setSecret(res.secret!);
      setQrDataUrl(
        await QRCode.toDataURL(res.uri, { width: 240, margin: 1, errorCorrectionLevel: 'M' }),
      );
    });
  }, [alreadyEnabled]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await verifyTotp(token);
      if (!res.ok) {
        setError(res.error ?? 'الرمز غير صحيح.');
        return;
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <>
      <FloatingThemeToggle />
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-14 rounded-3xl bg-ink" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">تحقق الأدمن</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            لوحة الأدمن تتحكم بالمنصة كاملة — تحتاج طبقة أمان إضافية.
          </p>
        </div>

        <Card className="p-6">
          {error && (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
          )}

          {mode === 'setup' && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-ink">١. امسح الرمز بتطبيق المصادقة</h2>
              <p className="mt-1 text-xs leading-6 text-ink-soft">
                استخدم Google Authenticator أو Microsoft Authenticator أو أي تطبيق TOTP.
              </p>

              <div className="mt-4 flex justify-center">
                {qrDataUrl ? (
                  // رمز QR مولّد محلياً كـ data URL
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="رمز التحقق بخطوتين"
                    className="rounded-2xl border border-sand-200 bg-surface p-2"
                    width={240}
                    height={240}
                  />
                ) : (
                  <div className="grid h-[240px] w-[240px] place-items-center rounded-2xl bg-sand-50 text-sm text-ink-faint">
                    جاري التوليد…
                  </div>
                )}
              </div>

              {secret && (
                <div className="mt-3 rounded-2xl bg-sand-50 p-3 text-center">
                  <p className="text-[11px] font-semibold text-ink-faint">
                    أو أدخل المفتاح يدوياً:
                  </p>
                  <code dir="ltr" className="mt-1 block break-all text-xs font-bold text-ink">
                    {secret}
                  </code>
                </div>
              )}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Field
              label={mode === 'setup' ? '٢. أدخل الرمز المعروض في التطبيق' : 'رمز التحقق'}
              hint="٦ أرقام تتغير كل ٣٠ ثانية"
              required
            >
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="text-center font-mono text-xl tracking-[0.4em]"
                required
                autoFocus={mode === 'verify'}
              />
            </Field>

            <Button type="submit" fullWidth size="lg" loading={pending} disabled={token.length !== 6}>
              {mode === 'setup' ? 'تفعيل ودخول' : 'دخول'}
            </Button>
          </form>

          {alreadyEnabled && mode === 'verify' && (
            <button
              type="button"
              onClick={() => {
                setMode('setup');
                setError(null);
                startTransition(async () => {
                  const res = await beginTotpSetup();
                  if (!res.ok || !res.uri) {
                    setError(res.error ?? 'تعذّرت التهيئة.');
                    return;
                  }
                  setSecret(res.secret!);
                  setQrDataUrl(await QRCode.toDataURL(res.uri, { width: 240, margin: 1 }));
                });
              }}
              className="mt-5 w-full text-center text-xs font-semibold text-ink-faint transition-colors hover:text-grape-600"
            >
              فقدت جهازك؟ أعد ربط تطبيق مصادقة جديد
            </button>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-ink-faint">
          <a href="/dashboard" className="font-bold text-grape-600">
            العودة للوحة المناسبات
          </a>
        </p>
      </div>
    </div>
    </>
  );
}

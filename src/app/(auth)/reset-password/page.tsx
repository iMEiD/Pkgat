'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('انتهت صلاحية رابط الاستعادة. اطلب رابطاً جديداً.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
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

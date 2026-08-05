'use client';

import { useActionState, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { changePassword, deleteMyAccount, updateProfile } from '@/lib/actions/account';
import type { ActionResult } from '@/lib/actions/events';
import { formatDate } from '@/lib/utils/format';
import type { Profile } from '@/lib/types/database';

export function AccountSettings({ profile, email }: { profile: Profile; email: string }) {
  const [profileState, profileAction, profilePending] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState<
    ActionResult | null,
    FormData
  >(changePassword, null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">إعدادات الحساب</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          عضو منذ {formatDate(profile.created_at)}
        </p>
      </div>

      <Card>
        <CardHeader title="بياناتك" />
        <CardBody>
          {profileState?.error && (
            <Alert tone="danger" className="mb-4">
              {profileState.error}
            </Alert>
          )}
          {profileState?.ok && (
            <Alert tone="success" className="mb-4">
              تم حفظ بياناتك.
            </Alert>
          )}

          <form action={profileAction} className="space-y-4">
            <Field label="الاسم" htmlFor="full_name" required>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name ?? ''}
                required
              />
            </Field>

            <Field label="البريد الإلكتروني" hint="لتغيير البريد تواصل مع الدعم">
              <Input value={email} dir="ltr" disabled />
            </Field>

            <Field label="رقم الجوال" htmlFor="phone" hint="اختياري">
              <Input id="phone" name="phone" defaultValue={profile.phone ?? ''} dir="ltr" />
            </Field>

            <Button type="submit" loading={profilePending}>
              حفظ
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="كلمة المرور" />
        <CardBody>
          {passwordState?.error && (
            <Alert tone="danger" className="mb-4">
              {passwordState.error}
            </Alert>
          )}
          {passwordState?.ok && (
            <Alert tone="success" className="mb-4">
              تم تغيير كلمة المرور.
            </Alert>
          )}

          <form action={passwordAction} className="space-y-4">
            <Field label="كلمة المرور الجديدة" htmlFor="password" hint="٨ أحرف على الأقل" required>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="تأكيد كلمة المرور" htmlFor="confirm" required>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
            <Button type="submit" loading={passwordPending}>
              تغيير كلمة المرور
            </Button>
          </form>
        </CardBody>
      </Card>

      {profile.is_super_admin && (
        <Card className="border-grape-200">
          <CardHeader
            title="صلاحيات الأدمن"
            description="حسابك يملك صلاحيات إدارة المنصة بالكامل."
          />
          <CardBody className="space-y-3">
            {!profile.totp_enabled && (
              <Alert tone="warning" title="التحقق بخطوتين غير مفعّل">
                لوحة الأدمن تتحكم بالمنصة كلها — فعّل التحقق بخطوتين قبل استخدامها.
              </Alert>
            )}
            <ButtonLink href="/admin">فتح لوحة الأدمن</ButtonLink>
          </CardBody>
        </Card>
      )}

      {!profile.is_super_admin && <DeleteAccountCard />}
    </div>
  );
}

/**
 * حذف الحساب — سياسة الخصوصية تَعِد بهذا الحق، فلا بد أن يكون موجوداً فعلاً.
 * التأكيد بكتابة كلمة صريحة لا بضغطة واحدة، لأن الحذف نهائي ويشمل المناسبات
 * والمدعوين وسجل المسح.
 */
function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteMyAccount(word);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر حذف الحساب.');
        return;
      }
      // الجلسة صارت لحساب محذوف — نخرج عبر مسار الخروج لتُمسح الكوكيز
      const form = document.createElement('form');
      form.method = 'post';
      form.action = '/api/auth/signout';
      document.body.appendChild(form);
      form.submit();
    });
  }

  return (
    <Card className="border-coral-200">
      <CardHeader
        title="حذف الحساب"
        description="يحذف حسابك وكل مناسباتك ومدعويك وسجل المسح نهائياً — بلا رجعة."
      />
      <CardBody className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {!open ? (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            أريد حذف حسابي
          </Button>
        ) : (
          <>
            <Alert tone="danger" title="هذا الإجراء لا يمكن التراجع عنه">
              ستُحذف كل مناسباتك وقوائم مدعويك وتقاريرك وحسابات المسح. لو عندك مناسبة قادمة،
              حمّل دعواتك وتقاريرك قبل الحذف.
            </Alert>

            <Field label="اكتب كلمة «حذف» للتأكيد" htmlFor="confirm-delete" required>
              <Input
                id="confirm-delete"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="حذف"
                autoComplete="off"
              />
            </Field>

            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={remove}
                loading={pending}
                disabled={word.trim() !== 'حذف'}
              >
                احذف حسابي نهائياً
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setWord('');
                  setError(null);
                }}
                disabled={pending}
              >
                إلغاء
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

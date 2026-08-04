'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { changePassword, updateProfile } from '@/lib/actions/account';
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
    </div>
  );
}

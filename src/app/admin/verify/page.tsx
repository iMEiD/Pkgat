import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AdminVerifyForm } from './AdminVerifyForm';
import { SetupRequired } from '@/components/SetupRequired';
import { hasAdmin2fa, requireUser } from '@/lib/auth/session';
import { checkAdminEnv } from '@/lib/config';

export const metadata: Metadata = {
  title: 'تحقق الأدمن',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminVerifyPage() {
  const session = await requireUser('/admin');
  if (!session.profile.is_super_admin) redirect('/dashboard');

  // التحقق بخطوتين يوقّع كوكي بسرّ الأدمن — نتأكد من وجوده قبل استخدامه
  const problems = checkAdminEnv();
  if (problems.length > 0) {
    return <SetupRequired title="التحقق بخطوتين يحتاج إعداداً" problems={problems} />;
  }
  if (await hasAdmin2fa(session.id)) redirect('/admin');

  return <AdminVerifyForm alreadyEnabled={session.profile.totp_enabled} />;
}

import type { Metadata } from 'next';

import { AccountSettings } from './AccountSettings';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'إعدادات الحساب' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireUser('/dashboard/settings');
  return <AccountSettings profile={session.profile} email={session.email} />;
}

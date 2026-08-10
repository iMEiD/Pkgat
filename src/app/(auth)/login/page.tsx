import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from './LoginForm';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registered?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionUser();
  if (session) redirect(params.next || '/dashboard');

  return (
    <LoginForm
      nextPath={params.next}
      justRegistered={params.registered === '1'}
      linkError={params.error}
    />
  );
}

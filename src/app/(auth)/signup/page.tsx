import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignupForm } from './SignupForm';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'إنشاء حساب' };

export default async function SignupPage() {
  const session = await getSessionUser();
  if (session) redirect('/dashboard');

  return <SignupForm />;
}

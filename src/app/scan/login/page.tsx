import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ScannerLoginForm } from './ScannerLoginForm';
import { getScannerSession } from '@/lib/auth/scanner-session';

export const metadata: Metadata = {
  title: 'دخول مسؤول الاستقبال',
  robots: { index: false, follow: false },
};

export default async function ScannerLoginPage() {
  const session = await getScannerSession();
  if (session) redirect('/scan');

  return <ScannerLoginForm />;
}

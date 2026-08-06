import type { Metadata } from 'next';

import { SuggestForm } from './SuggestForm';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'اقترح تحسيناً' };
export const dynamic = 'force-dynamic';

export default async function SuggestPage() {
  await requireUser('/dashboard/suggest');
  return <SuggestForm />;
}

import type { Metadata } from 'next';

import { PlansManager } from './PlansManager';
import { TestModePanel } from './TestModePanel';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import { isMoyasarConfigured } from '@/lib/payments/moyasar';
import { getSettings } from '@/lib/cms';
import type { Plan } from '@/lib/types/database';

export const metadata: Metadata = { title: 'الباقات والأسعار' };
export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  await requireAdmin();
  const supabase = createServiceClient();

  const [{ data }, settings, { count: testPayments }] = await Promise.all([
    supabase.from('plans').select('*').order('sort_order'),
    getSettings(),
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('provider_payment_id', 'simulated'),
  ]);

  const raw = settings.payments_test_mode;

  return (
    <div className="space-y-6">
      <TestModePanel
        enabled={raw === true || raw === 'true'}
        gatewayReady={isMoyasarConfigured()}
        testPayments={testPayments ?? 0}
      />
      <PlansManager plans={(data ?? []) as Plan[]} />
    </div>
  );
}

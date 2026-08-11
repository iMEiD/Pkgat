import type { Metadata } from 'next';

import { BillingClient } from './BillingClient';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { isMoyasarConfigured } from '@/lib/payments/moyasar';
import { paymentsTestMode } from '@/lib/payments/test-mode';
import type { EventRow, Payment, Plan, Subscription } from '@/lib/types/database';

export const metadata: Metadata = { title: 'الاشتراك والدفع' };
export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const { event: preselectedEvent } = await searchParams;
  const session = await requireUser('/dashboard/billing');
  const supabase = await createClient();

  const [plansRes, eventsRes, paymentsRes, subsRes, testMode] = await Promise.all([
    supabase.from('plans').select('*').eq('is_active', true).order('sort_order'),
    supabase
      .from('events')
      .select('*')
      .eq('owner_id', session.id)
      .order('starts_at', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('user_id', session.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', session.id)
      .eq('status', 'active'),
    paymentsTestMode(),
  ]);

  const subscriptions = (subsRes.data ?? []) as Subscription[];
  const activeSub =
    subscriptions.find(
      (s) => !s.current_period_end || new Date(s.current_period_end) > new Date(),
    ) ?? null;

  const plans = (plansRes.data ?? []) as Plan[];

  return (
    <BillingClient
      plans={plans}
      events={(eventsRes.data ?? []) as EventRow[]}
      payments={(paymentsRes.data ?? []) as Payment[]}
      activeSubscription={activeSub}
      activePlanName={plans.find((p) => p.id === activeSub?.plan_id)?.name ?? null}
      preselectedEvent={preselectedEvent ?? null}
      gatewayReady={isMoyasarConfigured() || testMode}
      testMode={testMode}
    />
  );
}

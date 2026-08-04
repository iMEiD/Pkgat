import type { Metadata } from 'next';

import { ScannersManager } from './ScannersManager';
import { getOwnedEvent } from '@/lib/data/event';
import { createClient } from '@/lib/supabase/server';
import type { ScannerAccount } from '@/lib/types/database';

export const metadata: Metadata = { title: 'مسؤولو المسح' };
export const dynamic = 'force-dynamic';

export default async function ScannersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [event, { data }] = await Promise.all([
    getOwnedEvent(id),
    supabase
      .from('scanner_accounts')
      .select('*')
      .eq('event_id', id)
      .order('created_at'),
  ]);

  return <ScannersManager event={event} scanners={(data ?? []) as ScannerAccount[]} />;
}

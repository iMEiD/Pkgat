import type { Metadata } from 'next';

import { EventSettingsForm } from './EventSettingsForm';
import { getOwnedEvent } from '@/lib/data/event';

export const metadata: Metadata = { title: 'إعدادات المناسبة' };
export const dynamic = 'force-dynamic';

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getOwnedEvent(id);

  return <EventSettingsForm event={event} />;
}

import type { Metadata } from 'next';

import { GuestsManager } from './GuestsManager';
import { getEventGuests, getEventTags, getGuestLimit, getOwnedEvent } from '@/lib/data/event';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'المدعوون' };
export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser();

  const [event, guests, tags] = await Promise.all([
    getOwnedEvent(id),
    getEventGuests(id),
    getEventTags(id),
  ]);
  const limit = await getGuestLimit(event, session.id);

  return <GuestsManager event={event} guests={guests} tags={tags} limit={limit} />;
}

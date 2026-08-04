import type { Metadata } from 'next';

import { DesignEditor } from './DesignEditor';
import { getOwnedEvent } from '@/lib/data/event';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { TemplateCategory, TemplateRow } from '@/lib/types/database';

export const metadata: Metadata = { title: 'تصميم الدعوة' };
export const dynamic = 'force-dynamic';

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser();
  const supabase = await createClient();

  const [event, templatesRes, categoriesRes] = await Promise.all([
    getOwnedEvent(id),
    supabase.from('templates').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('template_categories').select('*').order('sort_order'),
  ]);

  return (
    <DesignEditor
      event={event}
      userId={session.id}
      templates={(templatesRes.data ?? []) as TemplateRow[]}
      categories={(categoriesRes.data ?? []) as TemplateCategory[]}
    />
  );
}

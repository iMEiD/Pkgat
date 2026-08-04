import type { Metadata } from 'next';

import { TemplatesManager } from './TemplatesManager';
import { createServiceClient } from '@/lib/supabase/server';
import type { TemplateCategory, TemplateRow } from '@/lib/types/database';

export const metadata: Metadata = { title: 'القوالب الجاهزة' };
export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  const supabase = createServiceClient();

  const [{ data: templates }, { data: categories }] = await Promise.all([
    supabase.from('templates').select('*').order('sort_order').order('created_at'),
    supabase.from('template_categories').select('*').order('sort_order'),
  ]);

  return (
    <TemplatesManager
      templates={(templates ?? []) as TemplateRow[]}
      categories={(categories ?? []) as TemplateCategory[]}
    />
  );
}

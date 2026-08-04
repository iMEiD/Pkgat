import type { Metadata } from 'next';

import { ContentEditor } from './ContentEditor';
import { createServiceClient } from '@/lib/supabase/server';
import type { SiteContent, SiteSetting } from '@/lib/types/database';

export const metadata: Metadata = { title: 'محتوى الموقع' };
export const dynamic = 'force-dynamic';

export default async function AdminContentPage() {
  const supabase = createServiceClient();

  const [{ data: content }, { data: settings }] = await Promise.all([
    supabase.from('site_content').select('*').order('page').order('sort_order'),
    supabase.from('site_settings').select('*').order('key'),
  ]);

  return (
    <ContentEditor
      content={(content ?? []) as SiteContent[]}
      settings={(settings ?? []) as SiteSetting[]}
    />
  );
}

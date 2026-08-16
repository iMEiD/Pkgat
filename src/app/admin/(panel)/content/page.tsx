import type { Metadata } from 'next';

import { ContentEditor } from './ContentEditor';
import { SocialProofPanel } from '@/components/admin/SocialProofPanel';
import { GalleryTogglePanel } from '@/components/admin/GalleryTogglePanel';
import { createServiceClient } from '@/lib/supabase/server';
import {
  readGalleryEnabled,
  readSocialProof,
  readSocialProofMin,
  readSocialProofMode,
} from '@/lib/site-settings';
import type { SiteContent, SiteSetting } from '@/lib/types/database';

export const metadata: Metadata = { title: 'محتوى الموقع' };
export const dynamic = 'force-dynamic';

export default async function AdminContentPage() {
  const supabase = createServiceClient();

  const [{ data: content }, { data: settings }, stats, { count: published }] = await Promise.all([
    supabase.from('site_content').select('*').order('page').order('sort_order'),
    supabase.from('site_settings').select('*').order('key'),
    // الأرقام الحقيقية تُعرض للأدمن دائماً، حتى وهو على الوضع اليدوي —
    // فمن رأى رقمه الحقيقي قلّ أن يكتب غيره
    supabase.rpc('platform_stats').then(
      (r) => (r.error ? null : (r.data as unknown as { events: number; guests: number })),
      () => null,
    ),
    supabase
      .from('gallery_items')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true),
  ]);

  const map = Object.fromEntries(
    ((settings ?? []) as SiteSetting[]).map((s) => [s.key, s.value]),
  );

  return (
    <div className="space-y-6">
      <SocialProofPanel
        mode={readSocialProofMode(map)}
        min={readSocialProofMin(map)}
        manual={{
          events: readSocialProof(map).events ?? 0,
          guests: readSocialProof(map).guests ?? 0,
        }}
        real={stats}
      />

      <GalleryTogglePanel enabled={readGalleryEnabled(map)} published={published ?? 0} />

      <ContentEditor
        content={(content ?? []) as SiteContent[]}
        settings={(settings ?? []) as SiteSetting[]}
      />
    </div>
  );
}

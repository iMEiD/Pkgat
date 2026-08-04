import type { Metadata } from 'next';

import { GalleryManager } from './GalleryManager';
import { createServiceClient } from '@/lib/supabase/server';
import type { GalleryItem } from '@/lib/types/database';

export const metadata: Metadata = { title: 'معرض الأعمال' };
export const dynamic = 'force-dynamic';

export default async function AdminGalleryPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('gallery_items')
    .select('*')
    .order('sort_order')
    .order('created_at', { ascending: false });

  return <GalleryManager items={(data ?? []) as GalleryItem[]} />;
}

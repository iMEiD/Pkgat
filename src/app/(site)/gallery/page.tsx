import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';

import { Reveal } from '@/components/ui/Reveal';
import { SectionTitle, EmptyState } from '@/components/ui/Misc';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { getPageContent, getSettings, text } from '@/lib/cms';
import { readGalleryEnabled } from '@/lib/site-settings';
import { createClient } from '@/lib/supabase/server';
import { EVENT_TYPE_LABELS } from '@/lib/utils/format';
import type { GalleryItem } from '@/lib/types/database';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'معرض الأعمال',
  description: 'دعوات حقيقية أُنجزت على بكجات بتصاميم أصحابها.',
};

async function getItems(): Promise<GalleryItem[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('gallery_items')
      .select('*')
      .eq('is_published', true)
      .order('sort_order')
      .order('created_at', { ascending: false });
    return (data ?? []) as GalleryItem[];
  } catch {
    return [];
  }
}

export default async function GalleryPage() {
  const [c, items, settings] = await Promise.all([
    getPageContent('gallery'),
    getItems(),
    getSettings(),
  ]);

  /*
   * الصفحة مطفأة من لوحة الأدمن.
   *
   * ولا يكفي إخفاء روابطها: من حفظ العنوان أو وجده في محرك بحث يصل
   * إليها مباشرة، فيرى صفحة قرّر صاحب الموقع ألّا تُرى. فتُردّ ٤٠٤.
   */
  if (!readGalleryEnabled(settings)) notFound();

  return (
    <div className="pk-container py-16 lg:py-24">
      <Reveal>
        <SectionTitle
          center
          eyebrow="أعمالنا"
          title={text(c, 'gallery.title', 'أعمال عملائنا')}
          subtitle={text(
            c,
            'gallery.subtitle',
            'دعوات حقيقية أُنجزت على بكجات — بتصاميم أصحابها وباركود دخول لكل مدعو.',
          )}
        />
      </Reveal>

      {items.length === 0 ? (
        <EmptyState
          className="mt-12"
          icon="🖼️"
          title="لا توجد أعمال معروضة بعد"
          description="نضيف هنا دعوات عملائنا بإذنهم. كن أول من يظهر."
          action={<ButtonLink href="/signup">ابدأ مجاناً</ButtonLink>}
        />
      ) : (
        <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
          {items.map((item, i) => (
            <Reveal key={item.id} delay={(i % 6) * 70}>
              <figure className="pk-panel group relative overflow-hidden rounded-3xl border border-sand-200 bg-surface shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift break-inside-avoid">
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-sand-100">
                  <Image
                    src={item.image_url}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <figcaption className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-ink">{item.title}</h3>
                    {item.event_type && (
                      <Badge tone="grape">
                        {EVENT_TYPE_LABELS[item.event_type] ?? item.event_type}
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-1.5 text-xs leading-6 text-ink-soft">{item.description}</p>
                  )}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      )}

      <Reveal delay={120}>
        <div className="mt-16 text-center">
          <ButtonLink href="/signup" size="lg">
            صمّم دعوتك أنت أيضاً
          </ButtonLink>
        </div>
      </Reveal>
    </div>
  );
}

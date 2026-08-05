import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { defaultDesign } from '@/lib/design/defaults';
import type { DesignConfig } from '@/lib/types/database';

const DEMO_GUESTS = [
  'عبدالله الحربي',
  'سارة القحطاني',
  'محمد العتيبي',
  'نورة الشمري',
  'فهد الدوسري',
];

/**
 * يزرع مناسبة تجريبية جاهزة للمستخدم الجديد.
 *
 * الهدف أن يجرّب المسح خلال دقيقتين بدل أن يبني مناسبة كاملة من الصفر
 * قبل أن يرى القيمة. التفعيل مفتوح يدوياً وحصة الدعوات مساوية لعدد
 * المدعوين، فيمسح فوراً بلا انتظار وقت البداية وبلا اصطدام بالحد.
 *
 * يُستدعى مرة واحدة لكل مستخدم (يحرسه demo_seeded)، ويُتجاهل أي فشل
 * بصمت: تعذُّر زرع مناسبة تعريفية لا يجوز أن يمنع فتح اللوحة.
 */
export async function seedDemoEvent(userId: string): Promise<boolean> {
  const supabase = createServiceClient();

  try {
    // القفل الحقيقي: نعلّم الملف أولاً، فلو تزامن طلبان لا يُزرع مرتين
    const { data: claimed } = await supabase
      .from('profiles')
      .update({ demo_seeded: true })
      .eq('id', userId)
      .eq('demo_seeded', false)
      .select('id')
      .maybeSingle();

    if (!claimed) return false;

    const startsAt = new Date(Date.now() + 5 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);

    const design = defaultDesign() as unknown as DesignConfig;

    const { data: event } = await supabase
      .from('events')
      .insert({
        owner_id: userId,
        title: 'مناسبة تجريبية — جرّب المسح',
        event_type: 'other',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        venue: 'للتجربة فقط',
        design,
        is_demo: true,
        free_quota: DEMO_GUESTS.length,
        // مفعّلة يدوياً حتى يمسح فوراً بلا انتظار وقت البداية
        activation_override: 'open',
      })
      .select('id')
      .single();

    if (!event) return false;

    await supabase.from('guests').insert(
      DEMO_GUESTS.map((name) => ({ event_id: event.id, name, seats: 1 })),
    );

    return true;
  } catch {
    return false;
  }
}

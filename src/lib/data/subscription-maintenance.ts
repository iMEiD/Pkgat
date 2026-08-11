import { createServiceClient } from '@/lib/supabase/server';
import { emailShell, sendEmail } from '@/lib/email';
import { formatDate } from '@/lib/utils/format';

/**
 * صيانة الاشتراكات اليومية.
 *
 * فواتير مُيسّر دفعة واحدة لا اشتراك متكرر: لا يُخصم شيء تلقائياً عند
 * انتهاء الشهر، والتجديد قرار يتخذه المشترك بنفسه. وهذا مقبول — لكن
 * الصامت منه ليس: المشترك اليوم لا يعرف متى ينتهي اشتراكه إلا لو فتح
 * صفحة الدفع، فيكتشف الانتهاء حين تتوقف باركوداته على الباب.
 *
 * فمهمتان يوميتان:
 *   ١. تذكير قبل الانتهاء بمهلة تكفي للتجديد
 *   ٢. تعليم المنتهي «expired» بدل تركه «active» بتاريخ ماضٍ
 *
 * والحد يُحسب أصلاً من current_period_end لا من status، فالتعليم لا
 * يغيّر سلوكاً — لكنه يجعل ما في قاعدة البيانات صادقاً عمّا في الواقع.
 */

/** كم يوماً قبل الانتهاء نذكّر؟ مهلة تكفي للتجديد قبل مناسبة قريبة */
const NOTICE_DAYS = 7;

export interface MaintenanceResult {
  reminded: number;
  expired: number;
}

export async function runSubscriptionMaintenance(siteUrl: string): Promise<MaintenanceResult> {
  const supabase = createServiceClient();
  const now = new Date();

  const result: MaintenanceResult = { reminded: 0, expired: 0 };

  // ---- ١. التذكير قبل الانتهاء ----
  const noticeEdge = new Date(now.getTime() + NOTICE_DAYS * 24 * 3_600_000).toISOString();

  const { data: ending } = await supabase
    .from('subscriptions')
    .select('id, user_id, current_period_end, renewal_notice_for, plans(name)')
    .eq('status', 'active')
    .not('current_period_end', 'is', null)
    .gt('current_period_end', now.toISOString())
    .lte('current_period_end', noticeEdge)
    .limit(200);

  for (const sub of ending ?? []) {
    // التذكير مرة واحدة لكل فترة — والتجديد يغيّر النهاية فيُسمح به من جديد
    if (sub.renewal_notice_for === sub.current_period_end) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', sub.user_id)
      .maybeSingle();

    if (!profile?.email) continue;

    const planName = readPlanName(sub);
    const endsAt = sub.current_period_end as string;
    const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 86_400_000));

    const sent = await sendEmail({
      to: profile.email,
      subject: `اشتراكك في بكجات ينتهي بعد ${days} يوم`,
      html: emailShell(
        'اشتراكك قارب على الانتهاء',
        `<p style="line-height:1.9;margin:0 0 12px">
           اشتراكك${planName ? ` في «${planName}»` : ''} ينتهي في
           <strong>${formatDate(endsAt)}</strong>.
         </p>
         <p style="line-height:1.9;margin:0 0 16px">
           التجديد ما يتم تلقائياً — ولا يُخصم منك شيء بلا علمك. بعد الانتهاء ترجع مناسباتك
           للحد المجاني، وباركودات المدعوين الزايدين عن الحد ما تشتغل على الباب.
         </p>
         <a href="${siteUrl}/dashboard/billing"
            style="display:inline-block;background:#6D4AFF;color:#fff;text-decoration:none;
                   padding:12px 22px;border-radius:999px;font-weight:bold">جدّد اشتراكك</a>`,
      ),
    });

    if (sent === 'sent') {
      await supabase
        .from('subscriptions')
        .update({ renewal_notice_for: endsAt })
        .eq('id', sub.id);
      result.reminded += 1;
    }
  }

  // ---- ٢. تعليم المنتهي ----
  const { data: lapsed } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .not('current_period_end', 'is', null)
    .lt('current_period_end', now.toISOString())
    .select('id, user_id');

  result.expired = lapsed?.length ?? 0;

  for (const sub of lapsed ?? []) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', sub.user_id)
      .maybeSingle();

    if (!profile?.email) continue;

    await sendEmail({
      to: profile.email,
      subject: 'انتهى اشتراكك في بكجات',
      html: emailShell(
        'انتهى اشتراكك',
        `<p style="line-height:1.9;margin:0 0 16px">
           رجعت مناسباتك للحد المجاني. لو عندك مناسبة قريبة، جدّد قبلها حتى تشتغل باركودات
           كل مدعوينك على الباب.
         </p>
         <a href="${siteUrl}/dashboard/billing"
            style="display:inline-block;background:#6D4AFF;color:#fff;text-decoration:none;
                   padding:12px 22px;border-radius:999px;font-weight:bold">جدّد اشتراكك</a>`,
      ),
    });
  }

  return result;
}

/** العلاقة تصل ككائن أو مصفوفة حسب استنتاج العميل للنوع */
function readPlanName(row: unknown): string | null {
  const rel = (row as { plans?: unknown }).plans;
  const plan = (Array.isArray(rel) ? rel[0] : rel) as { name?: string } | undefined;
  return plan?.name ?? null;
}

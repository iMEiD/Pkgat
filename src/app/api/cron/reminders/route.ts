import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';
import { emailShell, isEmailConfigured, sendEmail } from '@/lib/email';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/**
 * تذكير ما قبل المناسبة بـ ٢٤ ساعة.
 *
 * يُشغَّل من Vercel Cron مرة واحدة يومياً (٨ مساءً بتوقيت الرياض) — لأن
 * باقة Hobby تسمح بتشغيل يومي واحد لا أكثر. ولأن الفحص يومي، النافذة
 * ٢٠–٤٤ ساعة لا ٢٤ بالضبط: بها يقع كل موعد ضمن تشغيل واحد على الأقل
 * مهما كانت ساعته، فلا يفوت أحد. وreminder_sent_at يمنع التكرار حين
 * يقع الموعد داخل تشغيلين متتاليين.
 *
 * الرسالة تركّز على شيء واحد: هل جرّبت المسح؟ لأن أكثر ما يفشل ليلة
 * المناسبة هو اكتشاف مشكلة لم تُختبر قبلها.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');

  // Vercel Cron يرسل Bearer CRON_SECRET تلقائياً
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const from = new Date(now + 20 * 3_600_000).toISOString();
  const to = new Date(now + 44 * 3_600_000).toISOString();

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, starts_at, venue, owner_id')
    .is('reminder_sent_at', null)
    .eq('is_demo', false)
    // المنتهية والمؤرشفة لا تُذكَّر — والباقي (مسودة/جاهزة/جارية) يُذكَّر
    .not('status', 'in', '("ended","archived")')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
  }

  if (!events?.length) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  let sent = 0;

  for (const event of events) {
    const [{ data: profile }, { count: guests }, { count: scanners }] = await Promise.all([
      supabase.from('profiles').select('email, full_name').eq('id', event.owner_id).maybeSingle(),
      supabase.from('guests').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
      supabase
        .from('scanner_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('is_active', true),
    ]);

    if (!profile?.email) continue;

    const warnings: string[] = [];
    if (!scanners) warnings.push('ما فيه حساب مسح فعّال — بدونه ما أحد يقدر يمسح على الباب.');
    if (!guests) warnings.push('ما أضفت أي مدعو بعد.');

    const result = await sendEmail({
      to: profile.email,
      subject: `مناسبتك «${event.title}» بكرة — جرّبت المسح؟`,
      html: emailShell(
        `مناسبتك بكرة`,
        `<p style="line-height:1.9;margin:0 0 12px">
           <strong>${event.title}</strong><br>
           ${formatDateTime(event.starts_at)}${event.venue ? ` · ${event.venue}` : ''}
         </p>
         <p style="line-height:1.9;margin:0 0 12px">
           عندك ${guests ?? 0} مدعو و${scanners ?? 0} حساب مسح فعّال.
         </p>
         ${
           warnings.length
             ? `<div style="background:#FFF4EC;border-radius:12px;padding:14px;margin:0 0 14px">
                  ${warnings.map((w) => `<p style="margin:0 0 6px;line-height:1.8">⚠️ ${w}</p>`).join('')}
                </div>`
             : ''
         }
         <p style="line-height:1.9;margin:0 0 16px">
           <strong>قبل بكرة:</strong> افتح لوحة المسح بجوالك وامسح دعوة واحدة فعلياً، وجرّب
           تمسحها مرة ثانية للتأكد أنها تُرفض. أكثر ما يفشل ليلة المناسبة هو شيء لم يُجرَّب قبلها.
         </p>
         <a href="${siteUrl}/dashboard/events/${event.id}"
            style="display:inline-block;background:#6D4AFF;color:#fff;text-decoration:none;
                   padding:12px 22px;border-radius:999px;font-weight:bold">افتح مناسبتك</a>`,
      ),
    });

    if (result === 'sent') sent += 1;

    // نعلّم المرسَل فقط؛ الفاشل يُعاد في تشغيل الغد ما دام ضمن النافذة.
    // والمتخطّى (بلا مزوّد بريد) يبقى بلا علامة حتى يصل التذكير فعلاً
    // بعد ضبط المزوّد — لا نحرقه بصمت.
    if (result === 'sent') {
      await supabase
        .from('events')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', event.id);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: events.length,
    sent,
    emailConfigured: isEmailConfigured(),
  });
}

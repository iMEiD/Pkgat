import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InviteView } from './InviteView';
import { getInvite } from '@/lib/data/invite';
import { getSettings } from '@/lib/cms';

/**
 * صفحة الدعوة — الصفحة الوحيدة في المنصة التي يفتحها من لا يعرفنا.
 *
 * لا ترويسة ولا ذيل ولا قائمة: المدعو جاء ليردّ لا ليتصفّح، وكلُّ
 * رابطٍ إضافيٍّ هنا يسحبه بعيداً عن الزرّ الوحيد الذي فُتحت الصفحة
 * لأجله.
 */

export const dynamic = 'force-dynamic';

/**
 * لا تُفهرس ولا تُؤرشف: الرابط يحمل اسم مدعوٍّ ومناسبةَ أُسرة، ووصولُه
 * إلى نتائج البحث تسريبٌ لا رجعة فيه.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invite = await getInvite(token);

  return {
    title: invite ? `دعوة ${invite.event.title}` : 'دعوة',
    robots: { index: false, follow: false, nocache: true },
  };
}

function str(settings: Record<string, unknown>, key: string, fallback: string): string {
  const v = settings[key];
  return typeof v === 'string' && v.trim() ? v : fallback;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [invite, settings] = await Promise.all([getInvite(token), getSettings()]);
  if (!invite) notFound();

  return (
    <InviteView
      token={token}
      invite={invite}
      copy={{
        confirmTitle: str(settings, 'invite_confirm_title', 'تم تأكيد حضورك'),
        confirmBody: str(
          settings,
          'invite_confirm_body',
          'احفظ الباركود أو صوّر الشاشة، وأبرزه عند البوابة.',
        ),
        declineTitle: str(settings, 'invite_decline_title', 'وصلنا اعتذارك'),
        declineBody: str(
          settings,
          'invite_decline_body',
          'شكراً لإخبارنا. نتطلع لرؤيتك في مناسبة قادمة.',
        ),
        noteLabel: str(settings, 'invite_note_label', 'تهنئة لصاحب المناسبة'),
        footerEnabled: settings.invite_footer_enabled !== false,
        footerText: str(settings, 'invite_footer_text', 'صُنعت هذه الدعوة عبر بكجات'),
        footerCta: str(settings, 'invite_footer_cta', 'اصنع دعوتك'),
      }}
    />
  );
}

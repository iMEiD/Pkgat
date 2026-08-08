import type { Metadata } from 'next';

import { SuggestForm } from './SuggestForm';
import { Reveal } from '@/components/ui/Reveal';
import { SectionTitle } from '@/components/ui/Misc';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'اقترح تحسيناً',
  description: 'اقترح ميزة أو بلّغ عن خلل في منصة بكجات.',
};

export const dynamic = 'force-dynamic';

export default async function SuggestPage() {
  // الصفحة مفتوحة للجميع — الجلسة تُقرأ فقط لتعبئة بيانات المسجّل تلقائياً
  const session = await getSessionUser();

  return (
    <div className="pk-container py-16 lg:py-24">
      <Reveal>
        <SectionTitle
          center
          eyebrow="رأيك يهمنا"
          title="اقترح تحسيناً"
          subtitle="ملاحظاتك تصل مباشرة لفريق بكجات — وهي أسرع طريقة يتحسّن بها الموقع."
        />
      </Reveal>

      <div className="mx-auto mt-12 max-w-2xl">
        <SuggestForm
          signedIn={Boolean(session)}
          knownName={session?.profile.full_name ?? null}
        />
      </div>
    </div>
  );
}

import type { Metadata } from 'next';

import { LegalPage, type LegalSection } from '@/components/site/LegalPage';
import { getPageContent, list, text } from '@/lib/cms';
import { PRIVACY_SECTIONS } from '@/lib/legal';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'سياسة الخصوصية',
  description: 'كيف تجمع منصة بكجات بياناتك وبيانات مدعويك، ولماذا، وكيف تتحكم فيها.',
};

export default async function PrivacyPage() {
  const c = await getPageContent('privacy');

  return (
    <LegalPage
      eyebrow="بكجات"
      title={text(c, 'privacy.title', 'سياسة الخصوصية')}
      lead={text(
        c,
        'privacy.lead',
        'نوضّح هنا أي بيانات نجمعها، ولماذا، ومن يطّلع عليها، وكيف تتحكم أنت فيها.',
      )}
      updated={text(c, 'privacy.updated', '')}
      sections={list<LegalSection>(c, 'privacy.sections', PRIVACY_SECTIONS)}
    />
  );
}

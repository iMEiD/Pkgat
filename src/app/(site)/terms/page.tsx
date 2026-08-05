import type { Metadata } from 'next';

import { LegalPage, type LegalSection } from '@/components/site/LegalPage';
import { getPageContent, list, text } from '@/lib/cms';
import { TERMS_SECTIONS } from '@/lib/legal';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'الشروط والأحكام',
  description: 'شروط استخدام منصة بكجات للدعوات الإلكترونية بباركود دخول.',
};

export default async function TermsPage() {
  const c = await getPageContent('terms');

  return (
    <LegalPage
      eyebrow="بكجات"
      title={text(c, 'terms.title', 'الشروط والأحكام')}
      lead={text(
        c,
        'terms.lead',
        'باستخدامك منصة بكجات فإنك توافق على الشروط التالية. نرجو قراءتها قبل إنشاء حسابك.',
      )}
      updated={text(c, 'terms.updated', '')}
      sections={list<LegalSection>(c, 'terms.sections', TERMS_SECTIONS)}
    />
  );
}

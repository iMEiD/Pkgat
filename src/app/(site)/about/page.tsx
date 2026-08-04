import type { Metadata } from 'next';

import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { SectionTitle } from '@/components/ui/Misc';
import { ButtonLink } from '@/components/ui/Button';
import { getPageContent, list, text } from '@/lib/cms';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'من نحن',
  description: 'تعرّف على بكجات — منصة الدعوات الإلكترونية بباركود دخول.',
};

interface ValueItem { title: string; body: string }

export default async function AboutPage() {
  const c = await getPageContent('about');
  const body = text(c, 'about.body', '');
  const values = list<ValueItem>(c, 'about.values', []);

  return (
    <div className="pk-container py-16 lg:py-24">
      <Reveal>
        <SectionTitle
          center
          eyebrow="بكجات"
          title={text(c, 'about.title', 'من نحن')}
          subtitle={text(c, 'about.lead', '')}
        />
      </Reveal>

      {body && (
        <Reveal delay={100}>
          <Card className="mx-auto mt-12 max-w-3xl p-7 sm:p-10">
            <div className="space-y-5 text-[15px] leading-9 text-ink-soft">
              {body.split('\n').filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {values.length > 0 && (
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={i * 90}>
              <Card interactive className="h-full p-6">
                <span className="font-display text-3xl font-black text-grape-200">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2 text-base font-bold text-ink">{v.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-soft">{v.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      )}

      <Reveal delay={150}>
        <div className="mt-16 text-center">
          <ButtonLink href="/signup" size="lg">
            جرّب بكجات مجاناً
          </ButtonLink>
        </div>
      </Reveal>
    </div>
  );
}

import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { SectionTitle } from '@/components/ui/Misc';

export interface LegalSection {
  title: string;
  body: string;
}

/**
 * تخطيط مشترك لصفحتَي الشروط والخصوصية — الصفحتان متطابقتان بنيوياً،
 * ويختلف محتواهما فقط، وهو مقروء من site_content ليعدّله الأدمن بلا كود.
 */
export function LegalPage({
  eyebrow,
  title,
  lead,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="pk-container py-16 lg:py-24">
      <Reveal>
        <SectionTitle center eyebrow={eyebrow} title={title} subtitle={lead} />
      </Reveal>

      {updated && (
        <Reveal delay={80}>
          <p className="mt-6 text-center text-xs font-semibold text-ink-faint">{updated}</p>
        </Reveal>
      )}

      <div className="mx-auto mt-12 max-w-3xl space-y-4">
        {sections.map((s, i) => (
          <Reveal key={s.title} delay={Math.min(i * 60, 300)}>
            <Card className="p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-grape-50 font-display text-sm font-bold text-grape-600">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 className="text-base font-bold text-ink">{s.title}</h2>
                  <p className="mt-2 text-[15px] leading-8 text-ink-soft">{s.body}</p>
                </div>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

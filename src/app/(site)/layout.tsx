import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { getPageContent, text } from '@/lib/cms';
import { getSessionUser } from '@/lib/auth/session';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [content, session] = await Promise.all([getPageContent('common'), getSessionUser()]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader signedIn={Boolean(session)} />
      <main className="flex-1">{children}</main>
      <SiteFooter
        tagline={text(
          content,
          'common.footer_tagline',
          'دعوات إلكترونية بباركود دخول — صُنع في السعودية.',
        )}
        note={text(content, 'common.footer_note', '© بكجات. جميع الحقوق محفوظة.')}
      />
    </div>
  );
}

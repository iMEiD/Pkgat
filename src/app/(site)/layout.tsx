import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { FloatingWhatsApp } from '@/components/site/FloatingWhatsApp';
import { getPageContent, getSettings, text } from '@/lib/cms';
import { readContactLinks, readGalleryEnabled } from '@/lib/site-settings';
import { getSessionUser } from '@/lib/auth/session';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [content, session, settings] = await Promise.all([
    getPageContent('common'),
    getSessionUser(),
    getSettings(),
  ]);

  const contact = readContactLinks(settings);
  const showGallery = readGalleryEnabled(settings);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader signedIn={Boolean(session)} showGallery={showGallery} />
      <main className="flex-1">{children}</main>
      <SiteFooter
        tagline={text(
          content,
          'common.footer_tagline',
          'دعوات إلكترونية بباركود دخول — صُنع في السعودية.',
        )}
        note={text(content, 'common.footer_note', '© بكجات. جميع الحقوق محفوظة.')}
        contact={contact}
        showGallery={showGallery}
      />

      {/* لا يظهر إلا إذا ضُبط رقم الواتساب في لوحة الأدمن */}
      {contact.whatsapp && <FloatingWhatsApp phone={contact.whatsapp} />}
    </div>
  );
}

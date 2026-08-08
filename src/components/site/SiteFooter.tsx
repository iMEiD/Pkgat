import Link from 'next/link';

import { Logo } from '@/components/ui/Logo';
import { Icon } from '@/components/ui/Icon';
import { whatsappHref, type ContactLinks } from '@/lib/site-settings';

const linkClass =
  'inline-flex min-h-11 items-center gap-2 transition-colors hover:text-grape-600';

export function SiteFooter({
  tagline,
  note,
  contact,
}: {
  tagline: string;
  note: string;
  contact: ContactLinks;
}) {
  const hasContact = Boolean(contact.whatsapp || contact.email);

  return (
    <footer className="mt-24 border-t border-sand-200 bg-sand-50/70">
      <div className="pk-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-7 text-ink-soft">{tagline}</p>

          {/* قناة تواصل مباشرة — تُخفى كل قناة لم يُضبط عنوانها */}
          {hasContact && (
            <ul className="mt-4 text-sm text-ink-soft">
              {contact.whatsapp && (
                <li>
                  <a
                    className={linkClass}
                    href={whatsappHref(contact.whatsapp, 'السلام عليكم، عندي سؤال عن بكجات')}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="whatsapp" className="h-4 w-4 text-grape-500" />
                    تواصل معنا واتساب
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a className={linkClass} href={`mailto:${contact.email}`}>
                    <Icon name="mail" className="h-4 w-4 text-grape-500" />
                    <span dir="ltr">{contact.email}</span>
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-sm font-bold text-ink">المنصة</h4>
          <ul className="mt-1 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/gallery">معرض الأعمال</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/pricing">الأسعار والباقات</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/about">من نحن</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-ink">حسابك</h4>
          <ul className="mt-1 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/signup">إنشاء حساب</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/login">تسجيل الدخول</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/scan/login">دخول مسؤول الاستقبال</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-ink">النظام</h4>
          <ul className="mt-1 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/terms">الشروط والأحكام</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/privacy">سياسة الخصوصية</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/suggest">اقترح تحسيناً</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-sand-200">
        <div className="pk-container flex flex-col items-center justify-between gap-2 py-6 text-xs text-ink-faint sm:flex-row">
          <p>{note}</p>
          <p dir="ltr" className="font-semibold tracking-[0.2em]">PKGAT</p>
        </div>
      </div>
    </footer>
  );
}

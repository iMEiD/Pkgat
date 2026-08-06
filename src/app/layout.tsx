import type { Metadata, Viewport } from 'next';

import { googleFontsHref } from '@/lib/design/fonts';
import { themeToCssVars } from '@/lib/design/theme';
import { colorModeScript } from '@/components/ui/ThemeToggle';
import { getTheme } from '@/lib/cms';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pkgat.com'),
  title: {
    default: 'بكجات — دعوات إلكترونية بباركود دخول',
    template: '%s · بكجات',
  },
  description:
    'صمّم دعوتك الإلكترونية، ولّد باركود فريد لكل مدعو، وتحكّم بالدخول من جوالك وقت المناسبة — بدون أي تطبيق.',
  keywords: ['دعوات إلكترونية', 'باركود دخول', 'دعوة عرس', 'تنظيم مناسبات', 'PKGAT', 'بكجات'],
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: 'بكجات',
    title: 'بكجات — دعوات إلكترونية بباركود دخول',
    description: 'من تصميم الدعوة إلى تقرير الحضور — كل شيء من المتصفح.',
  },
};

export const viewport: Viewport = {
  themeColor: '#FFFDF9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ألوان الهوية تُقرأ من قاعدة البيانات وتُحقن كمتغيرات CSS، فتغييرها من
  // لوحة الأدمن ينعكس على كل صفحات الموقع بدون إعادة بناء.
  const theme = await getTheme();

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <style
          id="pk-theme"
          dangerouslySetInnerHTML={{ __html: themeToCssVars(theme) }}
        />

        {/* يضبط الوضع قبل أول رسم — بدونه تومض الصفحة فاتحة ثم تسودّ */}
        <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
        {/*
          الخطوط تُحمَّل هنا وليس عبر next/font لأن نفس العائلات تُستخدم
          في الرسم على الكانفس، ونحتاج أسماء عائلات ثابتة نمررها إلى
          document.fonts.load قبل رسم أي نص.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontsHref()} />

        {/* بدون جافاسكربت لن يعمل مراقب التمرير — نُظهر كل المحتوى مباشرة */}
        <noscript>
          <style>{`.pk-reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}

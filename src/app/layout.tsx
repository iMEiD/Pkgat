import type { Metadata, Viewport } from 'next';

import { googleFontsHref } from '@/lib/design/fonts';
import { appearanceScript, appearanceToCssVars } from '@/lib/design/appearance';
import { themeToCssVars } from '@/lib/design/theme';
import { getAppearance, getPageContent, getTheme, text } from '@/lib/cms';
import './globals.css';

/**
 * البيانات الوصفية تُقرأ من قاعدة البيانات لا من الكود.
 *
 * عنوان التبويب ووصف نتائج البحث وبطاقة واتساب أكثرُ نصٍّ يُرى: يقرؤه
 * من لم يفتح الموقع بعد. فوجب أن يكون بيد صاحبه لا بيد من كتب الصفحة.
 *
 * وهي دالة لا ثابت، لأن الثابت يُحسب مرة عند البناء فلا يتغيّر إلا
 * بإعادة نشر — والغرض أن يتغيّر من اللوحة فوراً.
 */
export async function generateMetadata(): Promise<Metadata> {
  const c = await getPageContent('common');

  const title = text(c, 'common.site_title', 'بكجات — لإدارة الفعاليات');
  const suffix = text(c, 'common.title_suffix', 'بكجات');
  const description = text(
    c,
    'common.site_description',
    'ارفع دعوتك بأي تصميم، ونولّد باركود دخول فريد لكل مدعو. امسحه على الباب من جوالك واعرف مين حضر لحظة بلحظة.',
  );

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pkgat.com'),
    title: {
      default: title,
      template: `%s · ${suffix}`,
    },
    description,
    keywords: ['دعوات إلكترونية', 'باركود دخول', 'إدارة فعاليات', 'تنظيم مناسبات', 'PKGAT', 'بكجات'],
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      apple: '/icon.svg',
    },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: suffix,
      title,
      description,
      // معظم مشاركات الموقع تمرّ بواتساب، وبطاقته بلا صورة تبدو رابطاً مهملاً
      images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#FFFDF9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ألوان الهوية والمظهر يُقرآن من قاعدة البيانات ويُحقنان كمتغيرات CSS،
  // فتغييرهما من لوحة الأدمن ينعكس على كل صفحات الموقع بدون إعادة بناء.
  const [theme, appearance] = await Promise.all([getTheme(), getAppearance()]);

  return (
    <html
      lang="ar"
      dir="rtl"
      /*
       * سمة الأسطح على العنصر الجذري لا على الجسم: الترويسة الثابتة
       * والنوافذ المنبثقة تُرسم خارج شجرة الصفحة أحياناً، فوضعها هنا
       * يضمن أن يصلها الشكل نفسه.
       */
      data-surface={appearance.surface}
      /*
       * حين يفرض الأدمن وضعاً، أو يمنع اختيار الشكل، نُعلمه هنا فيُخفي
       * الزرّ المعنيّ نفسه. وزرٌ يظهر ولا يغيّر شيئاً أسوأ من غيابه.
       */
      data-mode-locked={appearance.mode === 'auto' ? undefined : ''}
      data-surface-locked={appearance.visitorChoice ? undefined : ''}
      suppressHydrationWarning
    >
      <head>
        <style
          id="pk-theme"
          dangerouslySetInnerHTML={{
            __html: themeToCssVars(theme) + appearanceToCssVars(appearance),
          }}
        />

        {/* يضبط الوضع قبل أول رسم — بدونه تومض الصفحة فاتحة ثم تسودّ */}
        <script dangerouslySetInnerHTML={{ __html: appearanceScript(appearance) }} />
        {/*
          الخطوط تُحمَّل هنا وليس عبر next/font لأن نفس العائلات تُستخدم
          في الرسم على الكانفس، ونحتاج أسماء عائلات ثابتة نمررها إلى
          document.fonts.load قبل رسم أي نص.
        */}
        {/*
          تحميل مسبق لخطّي الواجهة.
          
          هما في CSS داخل @font-face، والمتصفح لا يكتشفهما إلا بعد
          تحليل ورقة الأنماط ثم مطابقة عنصرٍ يستعملهما — أي متأخراً.
          والتحميل المسبق يبدأهما مع الصفحة، فلا يُرى النص بخطٍّ
          احتياطي ثم يقفز.
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/thmanyah/thmanyah-sans-Regular.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/thmanyah/thmanyah-serif-display-Bold.woff2"
          crossOrigin="anonymous"
        />

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

'use client';

import { useEffect, useState } from 'react';

import { whatsappHref } from '@/lib/site-settings';
import { cn } from '@/lib/utils/cn';

/**
 * زر واتساب عائم للتواصل المباشر.
 *
 * لا يظهر مع أول رسم: الزائر في أعلى الصفحة لم يقرأ شيئاً بعد، وزر
 * تواصل يقفز فوراً يقاطع أكثر مما يساعد. يظهر بعد أول تمرير حقيقي —
 * حين يكون قد رأى ما يكفي ليسأل عنه.
 *
 * لونه بنفسجي الهوية لا أخضر واتساب، ليبقى جزءاً من الموقع.
 */
export function FloatingWhatsApp({ phone }: { phone: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <a
      href={whatsappHref(phone, 'السلام عليكم، عندي سؤال عن بكجات')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل معنا على واتساب"
      className={cn(
        'fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-grape-500 py-3 pe-4 ps-3.5',
        'text-sm font-bold text-white shadow-pop transition-all duration-300',
        'hover:bg-grape-600 hover:shadow-lift active:scale-[0.97]',
        // نُبقيه في الشجرة ونخفيه بصرياً — الظهور والاختفاء بانتقال ناعم
        shown
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
      </svg>
      تواصل معنا
    </a>
  );
}

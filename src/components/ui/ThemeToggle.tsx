'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'pk-color-mode';

/**
 * مفتاح الوضع الليلي.
 *
 * الوضع الفعلي يُطبَّق قبل أول رسم عبر السكربت المضمّن في التخطيط الجذري
 * (راجع colorModeScript)، فلا تومض الصفحة بيضاء ثم تسودّ. هذا المكوّن
 * يقرأ ما طُبِّق فعلاً من عنصر html بدل أن يفترض قيمة ابتدائية، ولذلك لا
 * يعرض شيئاً قبل التركيب حتى لا يختلف عمّا رسمه الخادم.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ColorMode | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setMode(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: ColorMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* التخزين محجوب في التصفح الخفي عند بعض المتصفحات */
    }
  }

  const dark = mode === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الليلي'}
      aria-pressed={dark}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-sand-100 hover:text-ink',
        className,
      )}
    >
      {/* قبل التركيب نرسم أيقونة محايدة — لا نعرف الوضع بعد */}
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
          </>
        ) : (
          <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z" />
        )}
      </svg>
    </button>
  );
}

/**
 * سكربت يُحقن في <head> ويعمل قبل رسم الصفحة.
 *
 * الترتيب: اختيار المستخدم المحفوظ، ثم تفضيل نظامه. بدونه ترسم الصفحة
 * بالوضع الفاتح ثم تقفز للداكن بعد ترطيب React — وميض مزعج في كل تنقّل.
 */
export const colorModeScript = `
(function(){
  try {
    var saved = localStorage.getItem('${STORAGE_KEY}');
    var mode = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = mode;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`.trim();

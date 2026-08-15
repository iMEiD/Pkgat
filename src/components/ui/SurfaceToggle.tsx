'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';

export type Surface = 'classic' | 'glass';

const STORAGE_KEY = 'pk-surface';

/**
 * مفتاح الثيم: عصري (زجاجي) أو كلاسيكي.
 *
 * يعمل بمنطق زر الوضع الليلي نفسه: السمة على عنصر html تُضبط قبل أول
 * رسم من سكربت في التخطيط الجذري، وهذا المكوّن يقرأ ما طُبِّق فعلاً بدل
 * أن يفترض قيمة ابتدائية — فلا يختلف عمّا رسمه الخادم ولا تومض الصفحة.
 *
 * ولا يُعرض شيء قبل التركيب، ولا حين يمنع الأدمن اختيار الزائر.
 */
export function SurfaceToggle({
  className,
  withLabel,
}: {
  className?: string;
  /** نسخة بنصّ — للقوائم المنسدلة حيث الأيقونة وحدها لغز */
  withLabel?: boolean;
}) {
  const [surface, setSurface] = useState<Surface | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setLocked(root.hasAttribute('data-surface-locked'));
    setSurface(root.dataset.surface === 'glass' ? 'glass' : 'classic');
  }, []);

  if (locked || surface === null) return null;

  const glass = surface === 'glass';

  function toggle() {
    const next: Surface = glass ? 'classic' : 'glass';
    setSurface(next);
    document.documentElement.dataset.surface = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* التخزين محجوب في التصفح الخفي عند بعض المتصفحات */
    }
  }

  const label = glass ? 'الثيم العصري' : 'الثيم الكلاسيكي';

  if (withLabel) {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-sand-100',
          className,
        )}
      >
        <SurfaceIcon glass={glass} className="h-4.5 w-4.5" />
        {label}
        <span className="mr-auto text-xs text-ink-faint">{glass ? 'مفعّل' : 'مطفأ'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={glass ? 'التبديل للثيم الكلاسيكي' : 'التبديل للثيم العصري'}
      aria-pressed={glass}
      title={label}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-xl transition-colors hover:bg-sand-100 hover:text-ink',
        glass ? 'text-grape-600' : 'text-ink-soft',
        className,
      )}
    >
      <SurfaceIcon glass={glass} className="h-5 w-5" />
    </button>
  );
}

/**
 * أيقونة تصف الفرق لا الاسم: لوحان متراكبان للعصري (الشفافية تعني
 * أن ما تحت يُرى)، ومربّع مصمت للكلاسيكي.
 */
function SurfaceIcon({ glass, className }: { glass: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glass ? (
        <>
          <rect x="3" y="6" width="12" height="12" rx="3" />
          <rect x="9" y="6" width="12" height="12" rx="3" opacity="0.55" />
        </>
      ) : (
        <rect x="4" y="5" width="16" height="14" rx="3" />
      )}
    </svg>
  );
}

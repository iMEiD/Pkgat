'use client';

import { cn } from '@/lib/utils/cn';

export interface FontOption {
  family: string;
  label: string;
  weights: number[];
}

/**
 * اختيار الخط برؤيته لا بقراءة اسمه.
 *
 * كانت قائمة منسدلة بأسماء مجرّدة: يختار اسماً، يصعد لأعلى الصفحة ليرى
 * أثره في المعاينة، ثم ينزل ليجرّب غيره — مرة لكل خط. واسم الخط لا يقول
 * شيئاً لمن لا يعرف الخطوط أصلاً.
 *
 * هنا كل خيار مكتوب بخطّه نفسه، والاختيار يصير بالنظر لا بالتجريب.
 */
export function FontPicker({
  fonts,
  value,
  onChange,
  sample = 'اسم المدعو',
}: {
  fonts: FontOption[];
  value: string;
  onChange: (family: string) => void;
  /** النص المعروض في كل بطاقة — الأفضل أن يكون نص المستخدم نفسه */
  sample?: string;
}) {
  return (
    <div
      // w-full مع min-w-0: الحاوية تلتزم بعرض أبيها ولا تتمدّد بمحتواها،
      // فيبقى التمرير داخلها بدل أن يتجاوز الصفحة كلها
      className="-mx-1 flex w-full min-w-0 gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="radiogroup"
      aria-label="الخط"
    >
      {fonts.map((font) => {
        const on = font.family === value;

        return (
          <button
            key={font.family}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(font.family)}
            className={cn(
              // سقف للعرض: اسم مدعو طويل كان يمدّ البطاقة بلا حد
              'w-[7.5rem] shrink-0 rounded-2xl border-2 px-3 py-3 text-center transition-all duration-200',
              on
                ? 'border-grape-500 bg-grape-50'
                : 'border-sand-200 bg-surface hover:border-sand-400',
            )}
          >
            {/* النموذج بخطّه — وهو الغرض كله */}
            <span
              className="block truncate text-lg leading-8 text-ink"
              style={{ fontFamily: font.family }}
            >
              {sample || 'اسم المدعو'}
            </span>
            <span
              className={cn(
                'mt-1 block text-[11px]',
                on ? 'font-bold text-grape-600' : 'text-ink-faint',
              )}
            >
              {font.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

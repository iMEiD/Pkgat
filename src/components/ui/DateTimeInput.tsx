'use client';

import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils/cn';

/**
 * حقل تاريخ ووقت بأيقونة تقويم واضحة.
 *
 * حقل datetime-local الأصلي يعرض أيقونة تقويم باهتة وصغيرة على سطح
 * المكتب، ويصعب على المستخدم إدراك أنها قابلة للضغط — فيكتب التاريخ
 * يدوياً ويخطئ في الصيغة. هنا زر ظاهر يفتح المنتقي عبر showPicker،
 * مع الإبقاء على إمكانية الكتابة اليدوية لمن يفضّلها.
 *
 * الاتجاه ltr لأن صيغة التاريخ نفسها لاتينية، وعرضها rtl يقلب ترتيب
 * اليوم والشهر بصرياً على بعض المتصفحات.
 */
export function DateTimeInput({
  id,
  name,
  required,
  defaultValue,
  value,
  onChange,
  minNow,
  className,
}: {
  id: string;
  name?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** يمنع اختيار الماضي من المنتقي نفسه */
  minNow?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // «الآن» تختلف بين الخادم والمتصفح، فحسابها أثناء العرض الأول يسبّب
  // عدم تطابق في الترطيب (hydration). نضبطها بعد التركيب فقط.
  const [min, setMin] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (minNow) setMin(nowLocalValue());
  }, [minNow]);

  function openPicker() {
    const el = ref.current;
    if (!el) return;
    // showPicker غير مدعوم في كل المتصفحات — نرجع للتركيز عند غيابه
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* بعض المتصفحات ترفض الاستدعاء خارج تفاعل مباشر */
      }
    }
    el.focus();
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        id={id}
        name={name}
        type="datetime-local"
        required={required}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        min={min}
        dir="ltr"
        className="pl-12 [&::-webkit-calendar-picker-indicator]:opacity-0"
      />

      <button
        type="button"
        onClick={openPicker}
        aria-label="اختر التاريخ والوقت"
        className="absolute inset-y-0 left-0 grid w-12 place-items-center rounded-r-2xl text-ink-faint transition-colors hover:text-grape-600"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
          <circle cx="8.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}

/** أقرب قيمة مقبولة الآن بصيغة datetime-local وبتوقيت الرياض */
export function nowLocalValue(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );

  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

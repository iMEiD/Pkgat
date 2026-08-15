import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

/**
 * «قبل وبعد» — الدعوة نفسها، ثم الدعوة نفسها وعليها الباركود.
 *
 * هذي الفكرة كلها في صورة واحدة: نحن لا نصمّم لك دعوة، نضيف على دعوتك
 * باركود دخول لكل مدعو. وجملة تقول ذلك تحتاج قراءة؛ وصورتان متجاورتان
 * تقولانه قبل أن يقرأ.
 *
 * مرسومة بالكود لا بصور: تتبع ألوان الهوية، وتظهر بحدّة على كل شاشة،
 * ولا تُحمّل الصفحة ملفات — والأهم أنها لا تنتظر مصمّماً.
 */
export function BarcodeShowcase() {
  /*
   * عمودان على كل المقاسات لا على الشاشة الكبيرة وحدها.
   *
   * الغرض من القسم مقارنة، والمقارنة تحتاج أن تقع الصورتان في العين
   * معاً. وتكديسهما على الجوال يجعل الثانية تحت الأولى بتمريرة كاملة،
   * فتضيع المقارنة ويبقى مجرّد صورتين متتاليتين.
   */
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
      <Panel label="دعوتك كما هي" />

      {/* السهم يقلب في RTL تلقائياً بحكم اتجاه الصفحة */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-grape-500 text-white shadow-pop sm:h-10 sm:w-10">
          <Icon name="arrow" className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <span className="text-[10px] font-bold text-grape-600 sm:text-[11px]">بكجات</span>
      </div>

      <Panel label="نفسها + باركود لكل مدعو" withCode />
    </div>
  );
}

function Panel({ label, withCode }: { label: string; withCode?: boolean }) {
  return (
    <figure>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border shadow-soft',
          withCode ? 'border-grape-200' : 'border-sand-200',
        )}
        style={{ aspectRatio: '3 / 4' }}
      >
        {/* خلفية دعوة مجرّدة — إيحاء لا محاكاة لتصميم بعينه */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2A2140] via-[#3B2E58] to-[#221B33]" />
        <div className="absolute inset-3 rounded-xl border border-white/20" />

        <div className="absolute inset-x-0 top-[14%] px-3 text-center sm:px-6">
          <p className="text-[8px] tracking-[0.25em] text-white/50 sm:text-[10px]">بسم الله</p>
          <p className="mt-2 font-display text-[11px] font-bold leading-5 text-white/90 sm:mt-3 sm:text-sm sm:leading-6">
            يتشرّف بدعوتكم
            <br />
            لحضور حفل الزواج
          </p>
        </div>

        {/* اسم المدعو والباركود: ما تضيفه المنصة */}
        {withCode ? (
          <div className="absolute inset-x-0 bottom-[8%] flex flex-col items-center gap-1.5 sm:gap-2.5">
            <span className="rounded-lg bg-white/95 px-2 py-0.5 font-display text-[9px] font-bold text-[#2A2140] sm:px-3 sm:py-1 sm:text-[11px]">
              أبو عبدالله
            </span>
            {/*
              نسختان بحجمين لا نسخة واحدة مصغّرة بالتحويل.

              الخلايا الثابتة (٢ بكسل) كبيرة على بطاقة نصف عرض الجوال،
              فيزحف الرمز لأعلى ويصطدم اسم المدعو بنص الدعوة. والتحويل
              لا يحلّها: يصغّر المرئي ويُبقي الارتفاع المحجوز كما هو.
              فنرسم بحجم خلية أصغر — الارتفاع يصغر معه فعلاً.
            */}
            <QrMark cell={1.4} className="sm:hidden" />
            <QrMark cell={2} className="hidden sm:block" />
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-[8%] flex flex-col items-center gap-1.5 opacity-40 sm:gap-2.5">
            <span className="h-4 w-16 rounded-lg border border-dashed border-white/40 sm:h-[22px] sm:w-24" />
            <span className="h-10 w-10 rounded-lg border border-dashed border-white/40 sm:h-14 sm:w-14" />
          </div>
        )}
      </div>

      <figcaption
        className={cn(
          'mt-2.5 text-center text-xs font-bold',
          withCode ? 'text-grape-600' : 'text-ink-faint',
        )}
      >
        {label}
      </figcaption>
    </figure>
  );
}

/**
 * باركود مرسوم — شكلٌ معبّر لا رمز يُمسح.
 *
 * أول محاولة رسمت نمطاً عشوائياً بلا مربعات تحديد، فخرجت أقرب لخطوط
 * متوازية منها لباركود. والعين تعرف رمز QR من ثلاث مربعات في زواياه
 * قبل أي شيء آخر — فبدونها لا يُقرأ الشكل على ما هو.
 */
function QrMark({ cell, className }: { cell: number; className?: string }) {
  const size = 21; // نسخة QR الأولى
  const cells: boolean[] = [];

  /** المربع الواقع في زاوية: إطار خارجي، ثم فراغ، ثم قلب ممتلئ */
  const finderAt = (r: number, c: number, top: number, left: number): boolean | null => {
    const dr = r - top;
    const dc = c - left;
    if (dr < -1 || dr > 7 || dc < -1 || dc > 7) return null;
    // الفاصل الأبيض حول المربع
    if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return false;

    const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
    return ring === 3 || ring <= 1;
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const finder =
        finderAt(r, c, 0, 0) ??
        finderAt(r, c, 0, size - 7) ??
        finderAt(r, c, size - 7, 0);

      if (finder !== null) {
        cells.push(finder);
        continue;
      }

      // خطّا التوقيت بين المربعات
      if (r === 6 || c === 6) {
        cells.push((r === 6 ? c : r) % 2 === 0);
        continue;
      }

      // بيانات ثابتة لا عشوائية: الشكل نفسه في كل تصيير
      cells.push((r * 7 + c * 5 + ((r * c) % 5)) % 3 !== 0);
    }
  }

  return (
    <span
      className={cn('rounded bg-white p-1 shadow-lift sm:rounded-lg sm:p-1.5', className)}
      aria-hidden="true"
    >
      <span className="grid" style={{ gridTemplateColumns: `repeat(${size}, ${cell}px)` }}>
        {cells.map((on, i) => (
          <span
            key={i}
            style={{ width: cell, height: cell }}
            className={on ? 'bg-[#141019]' : 'bg-white'}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * نموذج زمني موحّد للمنصة: كل أوقات المناسبات بتوقيت السعودية.
 *
 * المشكلة التي يعالجها هذا الملف: خادم Vercel يعمل بتوقيت UTC، وحقل
 * datetime-local يرسل نصاً بلا منطقة زمنية («2026-09-12T20:00»). فكان
 * `new Date(value)` على الخادم يفسّره UTC ويخزّن لحظة تسبق المقصود بثلاث
 * ساعات — ولهذا كان الوقت «يتغيّر» بعد الحفظ، وكانت أوقات الدخول في
 * التقرير تظهر خاطئة.
 *
 * الحل: نفسّر ما يكتبه المستخدم دائماً كتوقيت الرياض، ونعرض كل الأوقات
 * بتوقيت الرياض — فيتطابق ما يراه على الخادم وفي المتصفح.
 */

export const EVENT_TIME_ZONE = 'Asia/Riyadh';

/** الرياض ثابتة على UTC+3 بلا توقيت صيفي */
const RIYADH_OFFSET = '+03:00';

/**
 * يحوّل قيمة حقل datetime-local («YYYY-MM-DDTHH:mm») إلى لحظة زمنية
 * بتفسيرها كتوقيت الرياض.
 */
export function parseEventLocal(value: string): Date | null {
  const clean = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(clean)) return null;

  const withSeconds = clean.length === 16 ? `${clean}:00` : clean;
  const date = new Date(`${withSeconds}${RIYADH_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const inputFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * يحوّل لحظة مخزّنة إلى قيمة تصلح لحقل datetime-local بتوقيت الرياض،
 * حتى يرى المستخدم نفس الوقت الذي أدخله تماماً عند التعديل.
 */
export function toEventLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const parts = Object.fromEntries(
    inputFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );

  // en-CA يعطي الترتيب YYYY-MM-DD، ونجمّعه بالشكل الذي يتوقعه الحقل
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/**
 * ترجمة أخطاء قاعدة البيانات إلى رسائل عربية تقول ما العمل.
 *
 * الخلفية: رسائل PostgreSQL إنجليزية وتقنية
 * («null value in column "user_id" ... violates not-null constraint»).
 * عرضها كما هي على مستخدم غير تقني لا يفيده، وإخفاؤها خلف «تعذّر الإرسال»
 * أسوأ — فقد أضاعت جلسة كاملة في تشخيص خطأ سببه ترحيل لم يُنفَّذ.
 *
 * الحل: نترجم السبب لجملة عربية تشير للإجراء، ونُبقي النص الأصلي
 * كتفصيل صغير حتى يبقى قابلاً للنقل عند طلب الدعم.
 */

/** الشكل المشترك بين أخطاء PostgREST وأخطاء Postgres المباشرة */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** أكواد تعني أن كائناً في المخطط غير موجود — أي أن ترحيلاً لم يُنفَّذ */
const SCHEMA_CODES = new Set([
  '42P01', // جدول غير موجود
  '42703', // عمود غير موجود
  '42883', // دالة غير موجودة
  'PGRST202', // PostgREST: الدالة غير موجودة في الذاكرة المؤقتة للمخطط
  'PGRST204', // PostgREST: العمود غير موجود
  'PGRST205', // PostgREST: الجدول غير موجود
]);

/** هل سبب الخطأ نقص في مخطط قاعدة البيانات (ترحيل لم يُنفَّذ)؟ */
export function isSchemaError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code && SCHEMA_CODES.has(error.code)) return true;
  // 23502 = حقل إلزامي تُرك فارغاً. حين يكون العمود مما يفترض الترحيل
  // أن يجعله اختيارياً، فالسبب ترحيل ناقص لا خطأ من المستخدم.
  return error.code === '23502';
}

/** اسم العمود من رسالة 23502، إن أمكن استخراجه */
function columnFromNotNull(message: string): string | null {
  return /null value in column "([^"]+)"/.exec(message)?.[1] ?? null;
}

/**
 * رسالة عربية واضحة لخطأ قاعدة بيانات.
 *
 * @param error   الخطأ كما أعادته Supabase
 * @param fallback ما نقوله حين لا نعرف السبب — يُصاغ حسب العملية
 */
export function describeDbError(error: DbErrorLike, fallback = 'تعذّر إتمام العملية.'): string {
  const code = error.code ?? '';
  const message = error.message ?? '';
  const raw = message.trim();
  // التفصيل التقني يبقى ظاهراً لكن في الذيل، ليُنقل للدعم عند الحاجة
  const tail = raw ? ` (التفصيل التقني: ${raw})` : '';

  if (code === '23502') {
    const column = columnFromNotNull(message);
    const which = column ? `الحقل «${column}»` : 'أحد الحقول';
    return (
      `قاعدة البيانات ما زالت تشترط ${which}، ومن المفترض أن يكون اختيارياً. ` +
      `هذا يعني أن تحديثاً على قاعدة البيانات لم يُنفَّذ بالكامل. ` +
      `افتح «فحص قاعدة البيانات» في لوحة الأدمن وستجد التحديث الناقص وكوده جاهزاً.${tail}`
    );
  }

  if (SCHEMA_CODES.has(code)) {
    return (
      'قاعدة البيانات ينقصها تحديث لم يُنفَّذ بعد. ' +
      `افتح «فحص قاعدة البيانات» في لوحة الأدمن وستجد التحديث الناقص وكوده جاهزاً.${tail}`
    );
  }

  if (code === '23505') return `هذه القيمة مستخدمة مسبقاً.${tail}`;
  if (code === '23503') return `البيانات مرتبطة بسجل غير موجود.${tail}`;
  if (code === '23514') return `القيمة المُدخلة خارج المسموح.${tail}`;

  // 42501 و PGRST301: سياسات الحماية (RLS) رفضت العملية
  if (code === '42501' || code === 'PGRST301') {
    return `صلاحيات قاعدة البيانات رفضت هذه العملية.${tail}`;
  }

  return `${fallback}${tail}`;
}

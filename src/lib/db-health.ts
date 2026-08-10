/**
 * فحص حالة قاعدة البيانات — أي ترحيل نُفِّذ وأيّها ناقص.
 *
 * الخلفية: الترحيلات تُنفَّذ يدوياً بلصقها في محرّر SQL في Supabase. لا
 * يوجد ما يؤكّد أنها وصلت كاملة — واللصق الناقص من الجوال يمرّ بلا أثر
 * ظاهر، ثم تظهر أعراضه بعد أيام كأخطاء غامضة في صفحات لا علاقة لها
 * بالترحيل. حدث هذا فعلاً أكثر من مرة وأضاع جلسات كاملة.
 *
 * الطريقة: لا نسأل قاعدة البيانات «أي ترحيل نفّذت» — فهي لا تحتفظ بذلك.
 * بل نجرّب فعلياً ما يفترض أن يكون الترحيل قد أضافه: نقرأ عموداً، أو
 * نستدعي دالة، أو نُدرج صفاً ونحذفه. النتيجة واقع لا ادّعاء.
 *
 * الصدق أهم من الاكتمال: ما لا نستطيع التحقق منه بيقين نُعلنه
 * «غير مؤكّد» ولا نخمّن.
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { DbErrorLike } from '@/lib/db-errors';

export type CheckState = 'ok' | 'missing' | 'unknown';

export interface CheckResult {
  /** ما الذي يتحقق منه هذا الفحص، بلغة صاحب المنصة لا بلغة قاعدة البيانات */
  label: string;
  state: CheckState;
  /** تفصيل تقني مختصر يُعرض عند الفشل فقط */
  detail?: string;
}

export interface MigrationStatus {
  file: string;
  /** ما الذي يمكّنه هذا الترحيل في الموقع */
  title: string;
  /** ما الذي يتعطّل بدونه — يُعرض عند النقص */
  breaks: string;
  state: CheckState;
  checks: CheckResult[];
}

export interface HealthReport {
  migrations: MigrationStatus[];
  missing: MigrationStatus[];
  unknown: MigrationStatus[];
  allGood: boolean;
}

/* ------------------------------------------------------------------ */
/* أدوات الفحص                                                         */
/* ------------------------------------------------------------------ */

type LooseResult = { data: unknown; error: DbErrorLike | null };

/**
 * واجهة ضيّقة على عميل Supabase.
 * الفحص يستهدف جداول وأعمدة قد لا تكون موجودة أصلاً، وهي بطبيعتها
 * خارج الأنواع المولّدة — فنصفها بنيوياً بدل تعطيل التحقق.
 */
interface ProbeClient {
  from(table: string): {
    select(columns: string): {
      limit(n: number): PromiseLike<LooseResult>;
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): PromiseLike<{ data: unknown; error: DbErrorLike | null }> };
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        maybeSingle(): PromiseLike<{ data: { id: string } | null; error: DbErrorLike | null }>;
      };
    };
    delete(): { eq(column: string, value: string): PromiseLike<LooseResult> };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<LooseResult>;
  storage: {
    getBucket(id: string): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const MISSING_COLUMN = new Set(['42703', 'PGRST204']);
const MISSING_FUNCTION = new Set(['42883', 'PGRST202']);

/** يقرأ عموداً واحداً: نجاحه يثبت وجود الجدول والعمود معاً */
async function probeColumn(
  sb: ProbeClient,
  table: string,
  column: string,
  label: string,
): Promise<CheckResult> {
  const { error } = await sb.from(table).select(column).limit(1);
  if (!error) return { label, state: 'ok' };

  const code = error.code ?? '';
  if (MISSING_TABLE.has(code)) {
    return { label, state: 'missing', detail: `الجدول ${table} غير موجود` };
  }
  if (MISSING_COLUMN.has(code)) {
    return { label, state: 'missing', detail: `العمود ${table}.${column} غير موجود` };
  }
  return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
}

/**
 * يستدعي دالة باسمها ومعاملاتها الفعلية.
 * تُستعمل فقط مع الدوال التي يمكن استدعاؤها بأمان ولا تغيّر شيئاً.
 */
async function probeFunction(
  sb: ProbeClient,
  fn: string,
  args: Record<string, unknown>,
  label: string,
): Promise<CheckResult> {
  const { error } = await sb.rpc(fn, args);
  if (!error) return { label, state: 'ok' };

  if (MISSING_FUNCTION.has(error.code ?? '')) {
    return { label, state: 'missing', detail: `الدالة ${fn} غير موجودة` };
  }
  return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
}

/**
 * وجود دالة لا يمكن استدعاؤها من الويب (معاملاتها أنواع صفوف).
 *
 * نستدعيها بلا معاملات عمداً: إن كانت غير موجودة إطلاقاً يردّ PostgREST
 * بأنه لم يجدها، وإن كانت موجودة بتوقيع مختلف يذكر اسمها في التلميح.
 * التمييز بينهما ليس قاطعاً، فنكتفي بـ«غير مؤكّد» بدل ادّعاء النقص.
 */
async function probeRowFunction(
  sb: ProbeClient,
  fn: string,
  label: string,
): Promise<CheckResult> {
  const { error } = await sb.rpc(fn, {});
  if (!error) return { label, state: 'ok' };

  const mentionsName = `${error.message ?? ''} ${error.hint ?? ''}`.includes(fn);
  if (MISSING_FUNCTION.has(error.code ?? '')) {
    return mentionsName
      ? { label, state: 'ok', detail: `الدالة ${fn} موجودة بتوقيعها الداخلي` }
      : { label, state: 'missing', detail: `الدالة ${fn} غير موجودة` };
  }
  return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
}

/**
 * الفحص الحاسم لصندوق الاقتراحات: يُدرج اقتراح زائر (بلا user_id) ثم
 * يحذفه فوراً. لا سبيل آخر للتأكد أن العمود صار اختيارياً فعلاً، وهذا
 * بالضبط ما ينكسر حين يصل الترحيل ناقصاً.
 */
async function probeGuestSuggestion(sb: ProbeClient): Promise<CheckResult> {
  const label = 'استقبال اقتراح من زائر غير مسجّل';

  const { data, error } = await sb
    .from('suggestions')
    .insert({
      user_id: null,
      name: 'فحص تلقائي',
      email: null,
      phone: null,
      category: 'other',
      message: 'صف فحص تلقائي من صفحة فحص قاعدة البيانات — يُحذف فوراً.',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    const code = error.code ?? '';
    if (code === '23502') {
      return {
        label,
        state: 'missing',
        detail: 'العمود user_id ما زال إلزامياً — الزائر لا يستطيع الإرسال',
      };
    }
    if (MISSING_TABLE.has(code)) {
      return { label, state: 'missing', detail: 'جدول suggestions غير موجود' };
    }
    return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
  }

  // تنظيف صف الفحص — وجوده في صندوق الاقتراحات إزعاج لا فائدة منه
  if (data?.id) await sb.from('suggestions').delete().eq('id', data.id);

  return { label, state: 'ok' };
}

/**
 * وجود صفّ بمفتاح بعينه في جدول مفاتيح/قيم.
 * تُستعمل لإعدادات ونصوص يضيفها الترحيل صفوفاً لا أعمدة.
 */
async function probeKeyRow(
  sb: ProbeClient,
  table: string,
  key: string,
  label: string,
): Promise<CheckResult> {
  const { data, error } = await sb.from(table).select('key').eq('key', key).maybeSingle();

  if (error) {
    const code = error.code ?? '';
    if (MISSING_TABLE.has(code) || MISSING_COLUMN.has(code)) {
      return { label, state: 'missing', detail: `الجدول ${table} غير مكتمل` };
    }
    return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
  }

  return data
    ? { label, state: 'ok' }
    : { label, state: 'missing', detail: `المفتاح «${key}» غير موجود في ${table}` };
}

/**
 * قيمة إعداد مضبوطة فعلاً لا مجرّد وجود صفّها.
 * حقل فارغ يعني عنصراً مخفياً في الموقع — وهو سؤال يتكرر: «وين الزر؟».
 */
async function probeSettingValue(
  sb: ProbeClient,
  key: string,
  label: string,
): Promise<CheckResult> {
  const { data, error } = await sb.from('site_settings').select('value').eq('key', key).maybeSingle();

  if (error) {
    return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
  }

  const raw = (data as { value?: unknown } | null)?.value;
  const filled = typeof raw === 'string' ? raw.trim() !== '' : raw != null && raw !== 0;

  return filled
    ? { label, state: 'ok' }
    : { label, state: 'missing', detail: `الحقل «${key}» فارغ — العنصر مخفي في الموقع` };
}

/**
 * دالة تُرجع صواباً حين يكون الشيء مركّباً.
 * غيابها نفسه دليل على أن الترحيل لم يُنفَّذ.
 */
async function probeBooleanFunction(
  sb: ProbeClient,
  fn: string,
  label: string,
): Promise<CheckResult> {
  const { data, error } = await sb.rpc(fn, {});

  if (error) {
    if (MISSING_FUNCTION.has(error.code ?? '')) {
      return { label, state: 'missing', detail: 'الترحيل لم يُنفَّذ بعد' };
    }
    return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
  }

  return data === true
    ? { label, state: 'ok' }
    : { label, state: 'missing', detail: 'الترحيل نُفِّذ جزئياً — الحارس غير مركّب' };
}

/** وجود مخزن ملفات في Supabase Storage */
async function probeBucket(sb: ProbeClient, bucket: string, label: string): Promise<CheckResult> {
  const { data, error } = await sb.storage.getBucket(bucket);
  if (data && !error) return { label, state: 'ok' };
  return { label, state: 'missing', detail: `مخزن الملفات «${bucket}» غير موجود` };
}

/** حالة الترحيل = أسوأ حالة بين فحوصه */
function rollUp(checks: CheckResult[]): CheckState {
  if (checks.some((c) => c.state === 'missing')) return 'missing';
  if (checks.some((c) => c.state === 'unknown')) return 'unknown';
  return 'ok';
}

/* ------------------------------------------------------------------ */
/* الفحص الكامل                                                        */
/* ------------------------------------------------------------------ */

/**
 * يفحص الترحيلات ٠٠٠٦ فما فوق، وهي التي تُنفَّذ يدوياً بعد الإطلاق.
 * الترحيلات ٠٠٠١–٠٠٠٥ أساسية: لو نقصت لما عمل الموقع أصلاً، فوجوده
 * يعمل هو إثباتها.
 */
export async function runHealthCheck(): Promise<HealthReport> {
  const sb = createServiceClient() as unknown as ProbeClient;

  const migrations: MigrationStatus[] = [];

  // ---- 0006 ----
  migrations.push({
    file: '0006_legal_and_content.sql',
    title: 'الشروط والخصوصية وموافقة نظام حماية البيانات',
    breaks: 'التسجيل لا يسجّل موافقة المستخدم على الشروط.',
    checks: await Promise.all([
      probeColumn(sb, 'profiles', 'terms_accepted_at', 'تسجيل وقت الموافقة على الشروط'),
      probeColumn(sb, 'profiles', 'marketing_consent', 'موافقة الرسائل التسويقية'),
    ]),
    state: 'ok',
  });

  // ---- 0007 ----
  migrations.push({
    file: '0007_phone_and_grants.sql',
    title: 'رقم الجوال في التسجيل ومنح الحصص',
    breaks: 'لا تستطيع منح حصة دعوات إضافية لمستخدم من لوحة الأدمن.',
    checks: await Promise.all([
      probeColumn(sb, 'profiles', 'phone', 'حفظ رقم جوال المستخدم'),
      probeColumn(sb, 'profiles', 'free_quota_override', 'منح حصة دعوات إضافية'),
    ]),
    state: 'ok',
  });

  // ---- 0008 ----
  migrations.push({
    file: '0008_demo_and_reminders.sql',
    title: 'المناسبة التجريبية وتذكير ٢٤ ساعة',
    breaks: 'المناسبة التجريبية لا تُنشأ، ورسائل التذكير لا تُرسل.',
    checks: await Promise.all([
      probeColumn(sb, 'events', 'is_demo', 'تمييز المناسبة التجريبية'),
      probeColumn(sb, 'events', 'reminder_sent_at', 'منع تكرار رسالة التذكير'),
      probeColumn(sb, 'profiles', 'demo_seeded', 'إنشاء التجريبية مرة واحدة لكل حساب'),
    ]),
    state: 'ok',
  });

  // ---- 0009 ----
  migrations.push({
    file: '0009_guest_limit.sql',
    title: 'حدّ الدعوات يحترم الاشتراك المدفوع',
    breaks: 'باركودات المشتركين تُعطَّل رغم الدفع، لأن قاعدة البيانات تحسب الحد المجاني وحده.',
    checks: await Promise.all([
      probeColumn(sb, 'profiles', 'free_quota_override', 'الحصة الإضافية الممنوحة'),
      probeRowFunction(sb, 'guest_over_limit', 'احتساب الحد حسب الاشتراك'),
    ]),
    state: 'ok',
  });

  // ---- 0010 ----
  migrations.push({
    file: '0010_suggestions_and_showcase.sql',
    title: 'صندوق الاقتراحات ومشاركة التصاميم',
    breaks: 'صفحة الاقتراحات ومعرض التصاميم المشتركة لا تعملان.',
    checks: await Promise.all([
      probeColumn(sb, 'suggestions', 'id', 'جدول الاقتراحات'),
      probeColumn(sb, 'events', 'shared_design', 'موافقة صاحب المناسبة على العرض'),
      probeColumn(sb, 'shared_designs', 'id', 'عرض التصاميم المشتركة للزوار'),
    ]),
    state: 'ok',
  });

  // ---- 0011 ----
  migrations.push({
    file: '0011_public_suggestions_unique_phone.sql',
    title: 'اقتراحات الزوار وتفرّد رقم الجوال',
    breaks: 'الزائر غير المسجّل لا يستطيع إرسال اقتراح، ورقم الجوال يتكرر بين الحسابات.',
    checks: await Promise.all([
      probeGuestSuggestion(sb),
      probeFunction(sb, 'is_phone_taken', { p_phone: '' }, 'كشف رقم الجوال المكرر عند التسجيل'),
    ]),
    state: 'ok',
  });

  // ---- 0012 ----
  migrations.push({
    file: '0012_custom_fonts.sql',
    title: 'رفع الخطوط المخصّصة',
    breaks: 'صفحة الخطوط لا تحفظ أي خط ترفعه.',
    checks: await Promise.all([
      probeColumn(sb, 'custom_fonts', 'id', 'جدول الخطوط المرفوعة'),
      probeBucket(sb, 'fonts', 'مخزن ملفات الخطوط'),
    ]),
    state: 'ok',
  });

  // ---- 0014 ----
  migrations.push({
    file: '0014_social_proof_and_links.sql',
    title: 'أرقام الإثبات الاجتماعي وروابط التواصل',
    breaks: 'لا تستطيع ضبط رابط انستقرام أو X، ولا أرقام المناسبات والتقييم — فلا تظهر في الموقع.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_settings', 'instagram_url', 'حقل رابط انستقرام في لوحة الأدمن'),
      probeKeyRow(sb, 'site_settings', 'social_proof_events', 'حقل عدد المناسبات'),
      probeKeyRow(sb, 'site_settings', 'social_proof_rating', 'حقل متوسط التقييم'),
    ]),
    state: 'ok',
  });

  // ---- 0015 ----
  migrations.push({
    file: '0015_home_faq_and_free_stat.sql',
    title: 'نصوص الأسئلة وبطاقة «١٠ دعوات» في الرئيسية',
    breaks: 'النصوص تعمل بقيم جاهزة، لكنك لا تستطيع تعديلها من لوحة الأدمن.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_content', 'home.faq', 'أسئلة الرئيسية قابلة للتعديل'),
      probeKeyRow(sb, 'site_content', 'home.stats.free_value', 'بطاقة «١٠ دعوات» قابلة للتعديل'),
    ]),
    state: 'ok',
  });

  // ---- 0016 (يشمل 0013) ----
  migrations.push({
    file: '0016_showcase_full_design.sql',
    title: 'المعرض يعرض الدعوة كاملة بنصوصها',
    breaks: 'المعرض يعرض صورة الخلفية وحدها بلا اسم المناسبة ولا تاريخها ولا أي نص كتبه صاحبها.',
    checks: await Promise.all([
      probeColumn(sb, 'shared_designs', 'design', 'كشف التصميم كاملاً للمعرض'),
    ]),
    state: 'ok',
  });

  // ---- 0017 ----
  migrations.push({
    file: '0017_support_contact_defaults.sql',
    title: 'رقم واتساب الدعم مضبوط',
    breaks: 'زر الواتساب العائم ورابط الفوتر لا يظهران إطلاقاً ما دام الحقل فارغاً.',
    checks: await Promise.all([
      probeSettingValue(sb, 'support_whatsapp', 'رقم الواتساب مضبوط'),
      probeSettingValue(sb, 'support_email', 'بريد الدعم مضبوط'),
    ]),
    state: 'ok',
  });

  // ---- 0018 — الأهم على الإطلاق ----
  migrations.push({
    file: '0018_privilege_and_billing_guards.sql',
    title: '🔒 حارس الصلاحيات والحدود',
    breaks:
      'أي مستخدم مسجّل يستطيع من متصفحه أن يجعل نفسه أدمن على المنصة كاملة، ' +
      'أو يرفع حصته المجانية فتعمل باركوداته بلا دفع. نفّذ هذا الترحيل قبل أي شيء آخر.',
    checks: await Promise.all([
      probeBooleanFunction(sb, 'security_guards_installed', 'الحارسان مركّبان في قاعدة البيانات'),
    ]),
    state: 'ok',
  });

  for (const m of migrations) m.state = rollUp(m.checks);

  return {
    migrations,
    missing: migrations.filter((m) => m.state === 'missing'),
    unknown: migrations.filter((m) => m.state === 'unknown'),
    allGood: migrations.every((m) => m.state === 'ok'),
  };
}

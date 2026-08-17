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
 * فحص معكوس: الترحيل يحذف شيئاً، فوجوده هو النقص.
 * تُستعمل مع الترحيلات التي ترفع ميزة بدل أن تضيفها.
 */
async function probeGone(sb: ProbeClient, table: string, label: string): Promise<CheckResult> {
  const { error } = await sb.from(table).select('id').limit(1);
  if (!error) return { label, state: 'missing', detail: `${table} ما زال موجوداً` };

  const code = error.code ?? '';
  if (MISSING_TABLE.has(code) || MISSING_COLUMN.has(code)) return { label, state: 'ok' };
  return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
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

/**
 * أثر الترحيل داخل قيمة مركّبة (قائمة أسئلة مثلاً).
 *
 * فحصُ المطابقة التامة لا يصلح هنا: القيمة مصفوفة يضيف إليها الأدمن
 * ويحذف، فأي تعديل مشروع منه يجعل الفحص يقول «ناقص». والذي يثبت أن
 * الترحيل وصل هو وجود الجملة التي زرعها، لا تطابق القائمة كلها.
 */
async function probeContentContains(
  sb: ProbeClient,
  key: string,
  needle: string,
  label: string,
): Promise<CheckResult> {
  const { data, error } = await sb.from('site_content').select('value').eq('key', key).maybeSingle();

  if (error) return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
  if (!data) return { label, state: 'ok', detail: 'يعمل بالقيمة الاحتياطية' };

  const value = (data as { value?: unknown }).value;
  return JSON.stringify(value ?? '').includes(needle)
    ? { label, state: 'ok' }
    : { label, state: 'missing', detail: 'النص المحفوظ ما زال النسخة القديمة' };
}

/** نص محفوظ في site_content يطابق ما يتوقعه الترحيل */
async function probeContentValue(
  sb: ProbeClient,
  key: string,
  expected: string,
  label: string,
): Promise<CheckResult> {
  const { data, error } = await sb.from('site_content').select('value').eq('key', key).maybeSingle();

  if (error) return { label, state: 'unknown', detail: error.message ?? 'خطأ غير متوقّع' };
  // غياب المفتاح يعني أن الكود يستخدم قيمته الاحتياطية الصحيحة أصلاً
  if (!data) return { label, state: 'ok', detail: 'يعمل بالقيمة الاحتياطية' };

  const value = (data as { value?: unknown }).value;
  return value === expected
    ? { label, state: 'ok' }
    : { label, state: 'missing', detail: 'النص المحفوظ ما زال القديم' };
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
    title: 'صندوق الاقتراحات',
    breaks: 'صفحة الاقتراحات لا تعمل — ملاحظات المستخدمين ما توصلك.',
    // مشاركة التصاميم كانت في هذا الترحيل أيضاً، ورُفعت في 0022
    checks: await Promise.all([probeColumn(sb, 'suggestions', 'id', 'جدول الاقتراحات')]),
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

  // 0013 و0016 كانا عن معرض التصاميم المشتركة، وقد رُفع في 0022

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

  // ---- 0019 ----
  migrations.push({
    file: '0019_account_wide_free_quota.sql',
    title: 'الحصة المجانية على الحساب كله',
    breaks:
      'العشر دعوات تبقى لكل مناسبة على حدة — فمن ينشئ خمس مناسبات يحصل على خمسين دعوة مجاناً.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_settings', 'free_quota_scope', 'إعداد نطاق الحصة موجود'),
    ]),
    state: 'ok',
  });

  // ---- 0020 ----
  migrations.push({
    file: '0020_free_quota_copy.sql',
    title: 'نصوص الحصة المجانية محدَّثة',
    breaks: 'الموقع يَعِد بـ«١٠ دعوات لكل مناسبة» بينما النظام يمنحها للحساب كله — وعدٌ يخالف السلوك.',
    /*
      نفحص أثره الباقي وحده.

      كان يفحص home.stats.free_label بمطابقة نصّية — ثم أعاد ٠٠٣٠ كتابة
      ذلك النص، فصار الفحص يقارن بنصٍّ باطل ويقول «ناقص» أبداً مهما
      نُفِّذ الترحيل. وهذا ما وقع فعلاً.

      وجواب سؤال «وش معنى الدعوات المجانية؟» في صفحة الأسعار وضعه ٠٠٢٠
      ولم يمسسه ترحيلٌ بعده — فهو الأثر الذي يثبت وصوله.
    */
    checks: await Promise.all([
      probeContentContains(
        sb,
        'pricing.faq',
        'تجرّب المنصة كاملة قبل أي ريال',
        'جواب سؤال الدعوات المجانية في صفحة الأسعار',
      ),
    ]),
    state: 'ok',
  });

  // ---- 0021 ----
  migrations.push({
    file: '0021_free_trial_ledger.sql',
    title: '🔒 دفتر التجربة المجانية',
    breaks:
      'حذف المناسبة يُرجع العشر دعوات كاملة — فيقدر أي مستخدم يعيد الكرّة بلا نهاية ' +
      'ولا يدفع أبداً. نفّذ هذا الترحيل قبل تفعيل بوابة الدفع.',
    checks: await Promise.all([
      probeColumn(sb, 'profiles', 'free_guests_used', 'دفتر ما استهلكه الحساب'),
      probeColumn(sb, 'guests', 'free_seq', 'رقم المدعو في الدفتر'),
      probeBooleanFunction(sb, 'security_guards_installed', 'حرّاس الدفتر والصلاحيات مركّبون'),
    ]),
    state: 'ok',
  });

  // ---- 0022 ----
  migrations.push({
    file: '0022_retire_design_sharing.sql',
    title: 'رفع مشاركة التصاميم',
    breaks:
      'العرض العام shared_designs ما زال يكشف تصاميم من شاركها سابقاً، ' +
      'وقسمٌ رُفع من الموقع لا مبرّر لبقاء بياناته مكشوفة.',
    checks: await Promise.all([
      probeGone(sb, 'shared_designs', 'العرض العام محذوف فعلاً'),
    ]),
    state: 'ok',
  });

  // ---- 0023 ----
  migrations.push({
    file: '0023_reviews.sql',
    title: 'تقييمات العملاء',
    breaks: 'صفحة التقييمات لا تعمل، والعميل ما يقدر يقيّم الخدمة من لوحته.',
    checks: await Promise.all([
      probeColumn(sb, 'reviews', 'status', 'جدول التقييمات'),
      probeColumn(sb, 'published_reviews', 'author_name', 'ما يراه الزائر من المنشور'),
      probeKeyRow(sb, 'site_content', 'home.reviews.title', 'عنوان قسم التقييمات قابل للتعديل'),
    ]),
    state: 'ok',
  });

  // ---- 0024 ----
  migrations.push({
    file: '0024_test_payments_and_renewal.sql',
    title: 'اختبار الشراء وتذكير التجديد',
    breaks:
      'ما تقدر تختبر الباقات قبل ربط مُيسّر، والمشترك ما يوصله تذكير قبل انتهاء اشتراكه ' +
      'فيكتشف الانتهاء حين تتوقف باركوداته على الباب.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_settings', 'payments_test_mode', 'إعداد وضع اختبار الدفع'),
      probeColumn(sb, 'subscriptions', 'renewal_notice_for', 'منع تكرار تذكير التجديد'),
    ]),
    state: 'ok',
  });

  // ---- 0025 ----
  migrations.push({
    file: '0025_discount_codes.sql',
    title: 'أكواد الخصم والمسوّقين',
    breaks: 'صفحة أكواد الخصم لا تعمل، ولا يمكن منح أي خصم ولا تتبّع عمولة مسوّق.',
    checks: await Promise.all([
      probeColumn(sb, 'discount_codes', 'code', 'جدول الأكواد'),
      probeColumn(sb, 'discount_redemptions', 'commission_halalas', 'سجل الاستعمالات والعمولات'),
      probeColumn(sb, 'payments', 'discount_halalas', 'أثر الخصم في سجل الدفع'),
      probeFunction(sb, 'claim_discount_use', { p_code_id: '00000000-0000-0000-0000-000000000000' }, 'حجز الاستعمال بلا تجاوز السقف'),
    ]),
    state: 'ok',
  });

  // ---- 0026 ----
  migrations.push({
    file: '0026_ended_beats_override.sql',
    title: 'إنهاء المناسبة يسبق التفعيل اليدوي',
    breaks:
      'من فعّل الباركودات يدوياً ثم أنهى مناسبته تبقى باركوداته تعمل على الباب، ' +
      'واللوحة تقول «مفعّلة» وهو أنهاها بنفسه.',
    checks: await Promise.all([
      // نفحص السلوك لا الوجود: الدالة قائمة منذ الترحيل الأول، فوجودها
      // لا يثبت أن هذا الترحيل نُفِّذ — والفحص الذي يخرج «مكتمل» أبداً
      // أسوأ من غياب الفحص، لأنه يُطمئن كذباً
      probeBooleanFunction(sb, 'ended_blocks_scanning', 'المناسبة المنتهية توقف الباركودات فعلاً'),
    ]),
    state: 'ok',
  });

  // ---- 0027 ----
  migrations.push({
    file: '0027_setup_confirmation.sql',
    title: 'تأكيد التجهيز وختم تحميل الدعوات',
    breaks:
      'خطوة «أتمم التجهيز» تبقى ناقصة أبداً مهما ضغط المستخدم حفظ، وخطوة تحميل الدعوات ' +
      'لا تكتمل — فتقف الخطوات عند الثالثة ولا تتقدّم.',
    checks: await Promise.all([
      probeColumn(sb, 'events', 'setup_confirmed_at', 'تأكيد صاحب المناسبة لبياناتها'),
      probeColumn(sb, 'events', 'invitations_downloaded_at', 'ختم أول تحميل للدعوات'),
    ]),
    state: 'ok',
  });

  // ---- 0028 ----
  migrations.push({
    file: '0028_positioning_copy.sql',
    title: 'رسالة الموقع: باركود لدعوتك',
    breaks:
      'الصفحة الرئيسية تقول «صمّم دعوتك» — فيقيسك الزائر بأدوات التصميم ويفوته ' +
      'أن قيمة المنصة في الباركود على دعوته هو.',
    checks: await Promise.all([
      /*
        نفحص نصّ صفحة الأسعار لا عنوان الرئيسية: العنوان أعاد ٠٠٣٠
        كتابته، فمقارنته بنصّ ٠٠٢٨ تقول «ناقص» أبداً. ونصّ الأسعار
        وضعه ٠٠٢٨ ولم يمسسه ترحيلٌ بعده.
      */
      probeContentValue(
        sb,
        'pricing.subtitle',
        'ارفع دعوتك وجرّب أول ١٠ باركودات مجاناً، وادفع فقط لما تحتاج أكثر.',
        'نص صفحة الأسعار محدَّث',
      ),
    ]),
    state: 'ok',
  });

  // ---- 0029 ----
  migrations.push({
    file: '0029_appearance.sql',
    title: 'مظهر الموقع بيد الأدمن',
    breaks:
      'قسم «المظهر» في صفحة الألوان يفتح لكنه لا يحفظ شيئاً: الوضع الليلي يبقى ' +
      'بيد الزائر وحده، ومفتاح الشكل الزجاجي بلا أثر مهما ضغطته.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_settings', 'appearance', 'إعداد المظهر مسجَّل'),
    ]),
    state: 'ok',
  });

  // ---- 0030 ----
  migrations.push({
    file: '0030_home_copy_rewrite.sql',
    title: 'نصوص الصفحة الرئيسية الجديدة',
    breaks:
      'الرئيسية تعرض النصّ القديم، وقسم «قبل/بعد» يظهر بلا عنوان مصغّر ' +
      'ولا شرح — لأن نصّيهما لم يُنشآ في قاعدة البيانات بعد.',
    checks: await Promise.all([
      probeContentValue(
        sb,
        'home.hero.title',
        'كل مدعو بباركوده، وتعرف مين حضر',
        'عنوان الرئيسية محدَّث',
      ),
      probeKeyRow(sb, 'site_content', 'home.showcase.body', 'نصّ قسم «قبل/بعد» قابل للتعديل'),
    ]),
    state: 'ok',
  });

  // ---- 0031 ----
  migrations.push({
    file: '0031_tiktok_and_social_labels.sql',
    title: 'حساب تيك توك',
    breaks: 'لا يوجد حقل لتيك توك في لوحة الأدمن، فلا يظهر الحساب في ذيل الموقع مهما أردت.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_settings', 'tiktok_url', 'حقل تيك توك في لوحة الأدمن'),
    ]),
    state: 'ok',
  });

  // ---- 0032 ----
  migrations.push({
    file: '0032_social_proof_auto.sql',
    title: 'أرقام الإثبات محسوبة من قاعدة البيانات',
    breaks:
      'شريط الأرقام يبقى على ما تكتبه بيدك فقط، ولا يوجد وضع تلقائي يحسبها ' +
      'من مناسباتك الحقيقية.',
    checks: await Promise.all([
      probeFunction(sb, 'platform_stats', {}, 'دالة حساب الأرقام الحقيقية'),
      probeKeyRow(sb, 'site_settings', 'social_proof_mode', 'إعداد مصدر الأرقام'),
    ]),
    state: 'ok',
  });

  // ---- 0033 ----
  migrations.push({
    file: '0033_gallery_toggle_and_customer_work.sql',
    title: 'صفحة «أعمالنا»: أعمال عملاء ومفتاح إطفاء',
    breaks:
      'صفحة «أعمالنا» تعرض القوالب الجاهزة على أنها أعمال أُنجزت، ولا يوجد ' +
      'مفتاح يطفئها في لوحة الأدمن.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_settings', 'gallery_enabled', 'مفتاح إظهار صفحة أعمالنا'),
    ]),
    state: 'ok',
  });

  // ---- 0034 ----
  migrations.push({
    file: '0034_hero_price_note.sql',
    title: 'سطر السعر في البطل قابل للتعديل',
    breaks: 'سطر «الباقات تبدأ من…» مكتوب في الكود — لا تقدر تغيّر صياغته ولا تخفيه.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_content', 'home.hero.price_note', 'نص سطر السعر قابل للتعديل'),
    ]),
    state: 'ok',
  });

  // ---- 0035 ----
  migrations.push({
    file: '0035_site_title_editable.sql',
    title: 'عنوان الموقع ووصفه قابلان للتعديل',
    breaks:
      'عنوان تبويب المتصفح ووصف نتائج البحث وبطاقة واتساب مكتوبة في الكود — ' +
      'ما تقدر تغيّرها من لوحتك.',
    checks: await Promise.all([
      probeKeyRow(sb, 'site_content', 'common.site_title', 'عنوان الموقع قابل للتعديل'),
      probeKeyRow(sb, 'site_content', 'common.site_description', 'وصف الموقع قابل للتعديل'),
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

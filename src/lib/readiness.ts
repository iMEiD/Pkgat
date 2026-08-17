/**
 * جاهزية الإطلاق — فحص البنية لا قاعدة البيانات.
 *
 * صفحة فحص قاعدة البيانات تسأل: أي ترحيل نُفِّذ؟ وهذه تسأل سؤالاً آخر:
 * لو أطلقتُ الموقع اليوم واشترك أول عميل، ما الذي ينكسر؟
 *
 * والفرق بين السؤالين حقيقي. قاعدة بيانات مكتملة ومفتاحُ بريدٍ ناقص
 * يعني أن العميل يسجّل ولا تصله رسالة التفعيل — فلا يدخل حسابه أبداً.
 * ولا يظهر ذلك في أي فحص للترحيلات.
 *
 * المبدأ نفسه المتّبع هناك: نجرّب لا نفترض، ونُعلن ما لا نستطيع الجزم
 * به «غير مؤكّد» بدل تخمينه. وكل بند يقول ما الذي يتعطّل بدونه — لا
 * اسم المتغيّر وحده، فاسمُ المتغيّر لا يعني شيئاً لصاحب المنصة.
 */

import { createServiceClient } from '@/lib/supabase/server';

export type ReadinessLevel = 'blocker' | 'warning' | 'ok' | 'unknown';

export interface ReadinessItem {
  /** بلغة صاحب المنصة لا بلغة الخادم */
  label: string;
  level: ReadinessLevel;
  /** ما الذي يتعطّل — يُعرض حين لا يكون سليماً */
  breaks?: string;
  /** ما الذي يفعله لإصلاحه */
  fix?: string;
  /** تفصيل تقني مختصر */
  detail?: string;
}

export interface ReadinessGroup {
  title: string;
  description: string;
  items: ReadinessItem[];
}

export interface ReadinessReport {
  groups: ReadinessGroup[];
  blockers: number;
  warnings: number;
}

/* ------------------------------------------------------------------ */

const env = (key: string) => (process.env[key] ?? '').trim();

/**
 * أسرارٌ يُشتبه أنها من ملف المثال أو من جلسة تجربة.
 *
 * السرّ الضعيف لا يظهر عطلاً: الموقع يعمل به تماماً. ولا يُكتشف إلا
 * حين ينتحل أحدهم جلسة مسؤول مسح — وقتها يكون الأوان قد فات.
 */
function suspectSecret(value: string): boolean {
  if (value.length < 32) return true;
  const lower = value.toLowerCase();
  if (/^(.)\1+$/.test(value)) return true; // حرف مكرّر
  if (/^0123456789/.test(value) || /^9876543210/.test(value)) return true;
  return ['change', 'secret', 'example', 'test', 'password'].some((w) => lower.includes(w));
}

function secretItem(key: string, label: string, breaks: string): ReadinessItem {
  const value = env(key);
  if (!value) {
    return {
      label,
      level: 'blocker',
      breaks,
      fix: `أضف ${key} في إعدادات المشروع على Vercel — قيمة عشوائية ٣٢ حرفاً فأكثر.`,
    };
  }
  if (suspectSecret(value)) {
    return {
      label,
      level: 'blocker',
      breaks: 'السرّ قصير أو يبدو قيمة تجريبية — يمكن تخمينه وانتحال الجلسات.',
      fix: `ولّد قيمة عشوائية جديدة وضعها في ${key}. المفتاح الضعيف لا يظهر عطلاً، ولا يُكتشف إلا بعد اختراق.`,
      detail: `الطول الحالي ${value.length} حرفاً`,
    };
  }
  return { label, level: 'ok' };
}

function requiredItem(key: string, label: string, breaks: string, fix: string): ReadinessItem {
  return env(key) ? { label, level: 'ok' } : { label, level: 'blocker', breaks, fix };
}

/* ------------------------------------------------------------------ */

async function bucketItem(bucket: string, label: string): Promise<ReadinessItem> {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.storage.getBucket(bucket);
    if (data && !error) return { label, level: 'ok' };
    return {
      label,
      level: 'blocker',
      breaks:
        bucket === 'designs'
          ? 'رفع الدعوات لا يعمل — العميل يختار ملفه ولا يُحفظ شيء.'
          : 'الخطوط المرفوعة من لوحتك لا تُحفظ ولا تظهر في المحرّر.',
      fix: `أنشئ مخزناً عاماً باسم «${bucket}» في Supabase ← Storage.`,
    };
  } catch {
    return { label, level: 'unknown', detail: 'تعذّر الاتصال بالتخزين' };
  }
}

/** اتصال فعلي بقاعدة البيانات — لا مجرّد وجود المفاتيح */
async function databaseItem(): Promise<ReadinessItem> {
  try {
    const sb = createServiceClient();
    const { error } = await sb.from('site_settings').select('key').limit(1);
    if (!error) return { label: 'الاتصال بقاعدة البيانات', level: 'ok' };
    return {
      label: 'الاتصال بقاعدة البيانات',
      level: 'blocker',
      breaks: 'الموقع كله لا يعمل: لا تسجيل ولا دخول ولا مسح.',
      fix: 'تأكد أن مشروع Supabase يعمل ولم يُوقَف، وأن مفاتيحه في Vercel صحيحة.',
      detail: error.message,
    };
  } catch (e) {
    return {
      label: 'الاتصال بقاعدة البيانات',
      level: 'blocker',
      breaks: 'الموقع كله لا يعمل.',
      fix: 'راجع مفاتيح Supabase في إعدادات Vercel.',
      detail: e instanceof Error ? e.message : undefined,
    };
  }
}

/* ------------------------------------------------------------------ */

export async function runReadinessCheck(): Promise<ReadinessReport> {
  const siteUrl = env('NEXT_PUBLIC_SITE_URL');
  const emailFrom = env('EMAIL_FROM');

  const [db, designs, fonts] = await Promise.all([
    databaseItem(),
    bucketItem('designs', 'مخزن الدعوات المرفوعة'),
    bucketItem('fonts', 'مخزن الخطوط'),
  ]);

  const groups: ReadinessGroup[] = [];

  // ============ الأساس ============
  groups.push({
    title: 'الأساس',
    description: 'بدون هذه لا يعمل الموقع إطلاقاً.',
    items: [
      db,
      requiredItem(
        'NEXT_PUBLIC_SUPABASE_URL',
        'رابط قاعدة البيانات',
        'الموقع لا يفتح.',
        'أضف NEXT_PUBLIC_SUPABASE_URL في Vercel ← Settings ← Environment Variables.',
      ),
      requiredItem(
        'SUPABASE_SERVICE_ROLE_KEY',
        'مفتاح الخدمة',
        'لوحة الأدمن ولوحة المسح لا تعملان.',
        'أضف SUPABASE_SERVICE_ROLE_KEY من Supabase ← Project Settings ← API.',
      ),
      designs,
      fonts,
    ],
  });

  // ============ الأمان ============
  groups.push({
    title: 'الأمان',
    description: 'أسرار توقيع الجلسات. ضعفها لا يظهر عطلاً — ولهذا يُفحص.',
    items: [
      secretItem(
        'SCANNER_SESSION_SECRET',
        'سرّ جلسات مسؤولي المسح',
        'مسؤولو الاستقبال لا يستطيعون الدخول للوحة المسح.',
      ),
      secretItem(
        'ADMIN_SESSION_SECRET',
        'سرّ جلسة الأدمن',
        'لا تستطيع دخول لوحة الأدمن.',
      ),
    ],
  });

  // ============ العنوان ============
  const urlItem: ReadinessItem = !siteUrl
    ? {
        label: 'عنوان الموقع',
        level: 'warning',
        breaks:
          'روابط تأكيد البريد وإعادة تعيين كلمة المرور قد تُبنى بعنوان خاطئ، فتوصل العميل لصفحة لا تعمل.',
        fix: 'أضف NEXT_PUBLIC_SITE_URL بقيمة https://pkgat.com',
      }
    : siteUrl.startsWith('http://') || siteUrl.includes('localhost')
      ? {
          label: 'عنوان الموقع',
          level: 'blocker',
          breaks: 'روابط البريد تشير إلى عنوان محلي أو غير آمن — العميل يضغطها ولا تفتح.',
          fix: 'اضبط NEXT_PUBLIC_SITE_URL على عنوان الموقع الحقيقي بـ https.',
          detail: siteUrl,
        }
      : { label: 'عنوان الموقع', level: 'ok', detail: siteUrl };

  // ============ البريد ============
  const emailItems: ReadinessItem[] = [];
  if (!env('RESEND_API_KEY') || !emailFrom) {
    emailItems.push({
      label: 'إرسال البريد',
      level: 'blocker',
      breaks:
        'لا تُرسل رسائل تأكيد الحساب ولا استعادة كلمة المرور ولا تذكير المناسبات. ' +
        'العميل يسجّل ولا تصله رسالة، فلا يدخل حسابه أبداً.',
      fix: 'أنشئ حساباً في Resend وأضف RESEND_API_KEY و EMAIL_FROM في Vercel.',
    });
  } else {
    emailItems.push({ label: 'إرسال البريد', level: 'ok' });

    /*
     * نطاق المرسِل.
     *
     * الإرسال من نطاق مشترك (resend.dev) أو من بريد مجاني يجعل الرسائل
     * تُصنَّف بريداً مزعجاً عند كثير من المستقبلين. ولا يظهر ذلك في أي
     * سجلّ: الإرسال ينجح، والرسالة تصل — إلى مجلّد المهملات.
     */
    const domain = emailFrom.split('@').pop()?.replace('>', '').trim() ?? '';
    const shared = /resend\.dev|gmail\.com|hotmail\.com|outlook\.com|yahoo\./i.test(domain);
    emailItems.push(
      shared
        ? {
            label: 'نطاق المرسِل موثَّق',
            level: 'warning',
            breaks:
              'الرسائل تُرسل من نطاق مشترك أو بريد مجاني، فتقع في «المهملات» عند كثير من العملاء. ' +
              'والإرسال ينجح في السجلّات — فلا تكتشف المشكلة إلا من شكوى عميل.',
            fix: 'وثّق نطاقك في Resend (سجلّا SPF و DKIM) وأرسل من عنوان عليه، مثل no-reply@pkgat.com',
            detail: emailFrom,
          }
        : { label: 'نطاق المرسِل موثَّق', level: 'ok', detail: emailFrom },
    );
  }

  // عنوان الردّ — عطلٌ صامت لا يشتكي منه إلا من ضاع سؤاله
  if (env('RESEND_API_KEY') && emailFrom) {
    const replyTo = env('EMAIL_REPLY_TO');
    emailItems.push(
      replyTo
        ? { label: 'عنوان الردّ', level: 'ok', detail: replyTo }
        : {
            label: 'عنوان الردّ',
            level: 'warning',
            breaks:
              'العميل يستلم رسالة تفعيل ويردّ عليها بسؤال — وهذا يقع كثيراً. وردُّه ' +
              'يذهب إلى العنوان الآليّ فلا يُقرأ، أو يرتدّ. ولا تعرف أنك خسرت السؤال.',
            fix: 'أضف EMAIL_REPLY_TO في Vercel بعنوان صندوق تقرؤه فعلاً، مثل hello@pkgat.com',
          },
    );
  }

  groups.push({
    title: 'البريد والعناوين',
    description: 'ما يصل العميل خارج الموقع — وأكثر ما ينكسر بصمت.',
    items: [urlItem, ...emailItems],
  });

  // ============ المهام المجدولة ============
  groups.push({
    title: 'المهام المجدولة',
    description: 'تذكير أصحاب المناسبات قبل موعدها.',
    items: [
      env('CRON_SECRET')
        ? { label: 'سرّ المهمة المجدولة', level: 'ok' }
        : {
            label: 'سرّ المهمة المجدولة',
            level: 'warning',
            breaks:
              'رابط التذكيرات مفتوح لمن يعرفه، ويمكن استدعاؤه مراراً فتُرسل رسائل مكرّرة لعملائك.',
            fix: 'أضف CRON_SECRET في Vercel بقيمة عشوائية — ويرسله Vercel Cron تلقائياً.',
          },
    ],
  });

  // ============ الدفع ============
  const hasMoyasar = Boolean(env('MOYASAR_SECRET_KEY'));
  groups.push({
    title: 'الدفع',
    description: 'يمكن الإطلاق بدونه بوضع الاختبار، ولا يمكن التحصيل.',
    items: [
      hasMoyasar
        ? { label: 'مفتاح ميسر', level: 'ok' }
        : {
            label: 'مفتاح ميسر',
            level: 'warning',
            breaks: 'لا يمكن تحصيل أي مبلغ. الاشتراكات تعمل بوضع الاختبار فقط.',
            fix: 'أضف MOYASAR_SECRET_KEY بعد اعتماد حسابك في ميسر.',
          },
      hasMoyasar && !env('MOYASAR_WEBHOOK_SECRET')
        ? {
            label: 'سرّ إشعار الدفع',
            level: 'blocker',
            breaks:
              'إشعارات الدفع تصل بلا تحقق من مصدرها — يستطيع أحدهم تزوير إشعار «تم الدفع» ' +
              'فيحصل على اشتراك بلا دفع.',
            fix: 'أضف MOYASAR_WEBHOOK_SECRET من لوحة ميسر ← Webhooks.',
          }
        : hasMoyasar
          ? { label: 'سرّ إشعار الدفع', level: 'ok' }
          : {
              label: 'سرّ إشعار الدفع',
              level: 'warning',
              breaks: 'يُضبط مع مفتاح ميسر.',
              fix: 'يأتي مع خطوة ربط ميسر.',
            },
    ],
  });

  const all = groups.flatMap((g) => g.items);
  return {
    groups,
    blockers: all.filter((i) => i.level === 'blocker').length,
    warnings: all.filter((i) => i.level === 'warning').length,
  };
}

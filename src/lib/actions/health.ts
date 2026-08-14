'use server';

import { requireAdmin } from '@/lib/auth/session';
import { migrationSql } from '@/lib/migration-sql';

/**
 * كود ترحيلٍ بعينه عند الطلب.
 *
 * الصفحة لا ترسل كود الترحيلات السليمة مع كل تحميل — تسعون كيلوبايت
 * على جوال بلا داعٍ. لكن حجبها كلياً يعني أن أي فحص يخطئ ويقول «مكتمل»
 * يترك صاحب المنصة بلا مخرج: لا يرى نقصاً، ولا يجد كوداً ينفّذه.
 *
 * وقد وقع هذا فعلاً: فحص الترحيل 0026 كان يسأل عن دالة قائمة منذ
 * الترحيل الأول، فيخرج «مكتمل» أبداً ولو لم يُنفَّذ الترحيل قط.
 *
 * فالكود متاح لكل ترحيل عند الطلب — ولا ضرر: كل الترحيلات مكتوبة بحيث
 * لا يؤذي تنفيذها مرتين.
 */
export async function fetchMigrationSql(
  file: string,
): Promise<{ ok: boolean; sql?: string; error?: string }> {
  await requireAdmin();

  const sql = migrationSql(file);
  if (!sql) return { ok: false, error: 'لم نجد كود هذا التحديث.' };

  return { ok: true, sql };
}

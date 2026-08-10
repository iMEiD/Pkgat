import { createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';

/**
 * تسجيل فعل إداري في سجل الأحداث.
 *
 * ليست في ملف 'use server': كل تصدير هناك يصير إجراءً قابلاً للنداء من
 * المتصفح، فأي مستخدم مسجّل يقدر يكتب في السجل ما يشاء. وسجلٌّ يُكتب
 * فيه من الخارج ليس سجلاً.
 */
export async function logAdminAction(
  action: string,
  table: string | null,
  targetId: string | null,
  meta?: Record<string, unknown>,
) {
  const session = await requireUser();
  const service = createServiceClient();

  await service.from('audit_logs').insert({
    actor_type: 'admin',
    actor_id: session.id,
    actor_name: session.profile.full_name ?? session.email,
    action,
    target_table: table,
    target_id: targetId,
    meta: meta ?? null,
  });
}

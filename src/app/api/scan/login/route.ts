import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

import { createServiceClient } from '@/lib/supabase/server';
import { setScannerCookie } from '@/lib/auth/scanner-session';

/**
 * مصادقة مسؤول الاستقبال — مستقلة تماماً عن Supabase Auth.
 * تستخدم مفتاح الخدمة لأن حسابات المسح ليست مستخدمي منصة.
 */
export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'طلب غير صالح' }, { status: 400 });
  }

  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'أدخل اسم المستخدم وكلمة المرور' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: scanner } = await supabase
    .from('scanner_accounts')
    .select('id, event_id, username, display_name, password_hash, is_active')
    .eq('username', username)
    .maybeSingle();

  // رسالة واحدة لكل حالات الفشل حتى لا نكشف أسماء المستخدمين الموجودة
  const invalid = NextResponse.json(
    { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' },
    { status: 401 },
  );

  if (!scanner) {
    // مقارنة وهمية لتقليل فروق التوقيت بين "غير موجود" و"كلمة مرور خاطئة"
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    return invalid;
  }

  const matches = await bcrypt.compare(password, scanner.password_hash);
  if (!matches) return invalid;

  if (!scanner.is_active) {
    return NextResponse.json(
      { ok: false, error: 'هذا الحساب موقوف. راجع صاحب المناسبة.' },
      { status: 403 },
    );
  }

  await supabase
    .from('scanner_accounts')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', scanner.id);

  await setScannerCookie({
    scannerId: scanner.id,
    eventId: scanner.event_id,
    username: scanner.username,
    displayName: scanner.display_name,
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';
import { getScannerSession } from '@/lib/auth/scanner-session';
import { SCANNER_ENV, checkEnv } from '@/lib/config';
import type { ScanResponse } from '@/lib/types/database';

/**
 * التحقق من باركود.
 *
 * كل المنطق (منع التكرار، نافذة التفعيل، التجاوز اليدوي) يتم داخل دالة
 * process_scan في قاعدة البيانات ضمن معاملة واحدة مع قفل الصف — فمحاولتان
 * متزامنتان من جهازين مختلفين لا تنجحان معاً أبداً.
 *
 * الاستجابة خفيفة عمداً لأنها تعمل على شبكة القاعة الضعيفة.
 */
export async function POST(request: NextRequest) {
  const problems = checkEnv(SCANNER_ENV);
  if (problems.length > 0) {
    return NextResponse.json(
      { ok: false, result: 'invalid', message: 'لوحة المسح غير مهيّأة على الخادم' },
      { status: 503 },
    );
  }

  const session = await getScannerSession();
  if (!session) {
    return NextResponse.json({ ok: false, result: 'invalid', message: 'انتهت الجلسة' }, { status: 401 });
  }

  let body: { code?: string; override?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, result: 'invalid', message: 'طلب غير صالح' }, { status: 400 });
  }

  const code = String(body.code ?? '').trim();
  if (!code) {
    return NextResponse.json({ ok: false, result: 'invalid', message: 'باركود فارغ' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('process_scan', {
    p_scanner_id: session.scannerId,
    p_code: code,
    p_override: Boolean(body.override),
  });

  if (error) {
    await supabase.from('error_logs').insert({
      level: 'error',
      source: 'api/scan/verify',
      message: error.message,
      context: { scannerId: session.scannerId, eventId: session.eventId },
    });
    return NextResponse.json(
      { ok: false, result: 'invalid', message: 'خطأ في الخادم — أعد المحاولة' },
      { status: 500 },
    );
  }

  return NextResponse.json(data as ScanResponse, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

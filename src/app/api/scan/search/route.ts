import { NextResponse, type NextRequest } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';
import { getScannerSession } from '@/lib/auth/scanner-session';
import { SCANNER_ENV, checkEnv } from '@/lib/config';

/**
 * بحث عن مدعو بالاسم داخل مناسبة مسؤول المسح.
 *
 * الحاجة عملية: يصل مدعو بلا دعوة أو بباركود تالف أو شاشة مكسورة، فيحتاج
 * المسؤول أن يجده بالاسم ويؤكد دخوله بدل رفضه على الباب.
 * النتائج مقيّدة بمناسبة هذا المسؤول فقط — لا يمكنه رؤية مدعوي غيره.
 */
export async function POST(request: NextRequest) {
  if (checkEnv(SCANNER_ENV).length > 0) {
    return NextResponse.json({ ok: false, guests: [] }, { status: 503 });
  }

  const session = await getScannerSession();
  if (!session) {
    return NextResponse.json({ ok: false, guests: [] }, { status: 401 });
  }

  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, guests: [] }, { status: 400 });
  }

  const query = String(body.query ?? '').trim();
  if (query.length < 2) {
    return NextResponse.json({ ok: true, guests: [] });
  }

  const supabase = createServiceClient();

  // نهرّب محارف البحث الخاصة حتى لا تُفسَّر كأنماط
  const safe = query.replace(/[%_,]/g, ' ');

  const { data, error } = await supabase
    .from('guest_states')
    .select('id, name, code, code_state, checked_in_at, seats, tag_id')
    .eq('event_id', session.eventId)
    .ilike('name', `%${safe}%`)
    .order('name')
    .limit(15);

  if (error) {
    return NextResponse.json({ ok: false, guests: [] }, { status: 500 });
  }

  // نُرجع أقل قدر ممكن — الشبكة داخل القاعة ضعيفة
  return NextResponse.json(
    {
      ok: true,
      guests: (data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        code: g.code,
        state: g.code_state,
        seats: g.seats,
        checkedInAt: g.checked_in_at,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

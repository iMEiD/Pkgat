import { NextResponse, type NextRequest } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';
import { applyPaidPayment } from '@/lib/actions/billing';

/**
 * ويب-هوك مُيسّر — شبكة الأمان لو أغلق المستخدم المتصفح قبل رجوعه للموقع.
 *
 * محمي بالرمز السرّي المضبوط في لوحة مُيسّر (MOYASAR_WEBHOOK_SECRET)،
 * ويطبّق نفس منطق التفعيل المصمَّم ليكون آمناً عند التكرار.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.MOYASAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 503 });
  }

  let body: {
    secret_token?: string;
    type?: string;
    data?: { id?: string; status?: string; metadata?: Record<string, string> };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.secret_token !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const paymentId = body.data?.metadata?.payment_id;
  const status = body.data?.status;

  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: 'no payment_id' });
  }

  const supabase = createServiceClient();

  if (status === 'paid') {
    await applyPaidPayment(paymentId);
  } else if (status === 'failed' || status === 'canceled' || status === 'expired') {
    await supabase
      .from('payments')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', paymentId)
      .neq('status', 'paid');
  }

  return NextResponse.json({ ok: true });
}

'use server';

import { headers } from 'next/headers';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { createInvoice, fetchInvoice, isMoyasarConfigured } from '@/lib/payments/moyasar';
import { SIMULATED_REF, paymentsTestMode } from '@/lib/payments/test-mode';
import type { Plan } from '@/lib/types/database';

export interface CheckoutResult {
  ok: boolean;
  error?: string;
  url?: string;
}

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

/**
 * يبدأ عملية دفع: ينشئ سجل دفع محلي ثم فاتورة لدى مُيسّر،
 * ويعيد رابط صفحة الدفع المستضافة.
 */
export async function startCheckout(
  planId: string,
  eventId: string | null,
): Promise<CheckoutResult> {
  const session = await requireUser();

  const testMode = await paymentsTestMode();

  if (!isMoyasarConfigured() && !testMode) {
    return {
      ok: false,
      error: 'بوابة الدفع غير مفعّلة بعد على هذه البيئة. تواصل مع الدعم لإتمام الدفع.',
    };
  }

  const supabase = await createClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .eq('is_active', true)
    .single();

  if (!plan) return { ok: false, error: 'الباقة غير متاحة.' };
  const typedPlan = plan as Plan;

  if (typedPlan.price_halalas <= 0) {
    return { ok: false, error: 'هذه الباقة مجانية ولا تحتاج دفعاً.' };
  }

  // الباقات لمرة واحدة يجب ربطها بمناسبة محددة
  if (typedPlan.billing_period === 'one_time') {
    if (!eventId) return { ok: false, error: 'اختر المناسبة التي تريد تفعيلها.' };

    const { data: event } = await supabase
      .from('events')
      .select('id, owner_id')
      .eq('id', eventId)
      .single();

    if (!event || event.owner_id !== session.id) {
      return { ok: false, error: 'المناسبة غير موجودة.' };
    }
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      user_id: session.id,
      event_id: typedPlan.billing_period === 'one_time' ? eventId : null,
      plan_id: typedPlan.id,
      amount_halalas: typedPlan.price_halalas,
      currency: typedPlan.currency,
      status: 'initiated',
      // في المحاكاة نوسم السجل من لحظة إنشائه: كل ما يتفرّع عنه
      // (اشتراك أو مناسبة مدفوعة) يحمل الوسم نفسه فيُنظَّف كله دفعة
      ...(testMode
        ? { provider: SIMULATED_REF, provider_payment_id: SIMULATED_REF, raw: { simulated: true } }
        : {}),
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    return { ok: false, error: 'تعذّر بدء عملية الدفع.' };
  }

  /*
   * الوضع التجريبي: نمرّ بنفس الطريق تماماً — نفس سجل الدفع، ونفس دالة
   * التفعيل، ونفس صفحة النتيجة — ولا نتصل بالبوابة. فما يُختبر هنا هو
   * ما سيحدث فعلاً بعد الشراء الحقيقي، لا محاكاة موازية له.
   */
  if (testMode) {
    await applyPaidPayment(payment.id);
    const origin = await siteOrigin();
    return { ok: true, url: `${origin}/dashboard/billing/callback?payment=${payment.id}` };
  }

  try {
    const origin = await siteOrigin();
    const invoice = await createInvoice({
      amountHalalas: typedPlan.price_halalas,
      currency: typedPlan.currency,
      description: `بكجات — ${typedPlan.name}`,
      callbackUrl: `${origin}/dashboard/billing/callback?payment=${payment.id}`,
      metadata: {
        payment_id: payment.id,
        user_id: session.id,
        plan_code: typedPlan.code,
        event_id: eventId ?? '',
      },
    });

    await supabase
      .from('payments')
      .update({ provider_payment_id: invoice.id, updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    return { ok: true, url: invoice.url };
  } catch (err) {
    await supabase
      .from('payments')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    // نسجّل التفاصيل للأدمن ولا نكشفها للمستخدم
    const service = createServiceClient();
    await service.from('error_logs').insert({
      level: 'error',
      source: 'billing/startCheckout',
      message: (err as Error).message,
      context: { planId, eventId },
      user_id: session.id,
    });

    return { ok: false, error: 'تعذّر الاتصال ببوابة الدفع. حاول بعد قليل.' };
  }
}

/**
 * يؤكد الدفع بعد رجوع المستخدم من بوابة الدفع.
 * الحالة تُقرأ من مُيسّر مباشرةً — لا نعتمد على معطيات الرابط.
 */
export async function confirmPayment(paymentId: string): Promise<{
  ok: boolean;
  status: 'paid' | 'pending' | 'failed';
  message: string;
}> {
  const session = await requireUser();
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('user_id', session.id)
    .single();

  if (!payment) {
    return { ok: false, status: 'failed', message: 'عملية الدفع غير موجودة.' };
  }

  const simulated = payment.provider_payment_id === SIMULATED_REF;

  if (payment.status === 'paid') {
    return {
      ok: true,
      status: 'paid',
      message: simulated
        ? 'دفع تجريبي ناجح — ما انخصم أي مبلغ. الباقة مفعّلة الآن كأنك دفعت فعلاً.'
        : 'تم تأكيد الدفع مسبقاً.',
    };
  }

  if (!payment.provider_payment_id) {
    return { ok: false, status: 'failed', message: 'لم تكتمل عملية الدفع.' };
  }

  const invoice = await fetchInvoice(payment.provider_payment_id);

  if (!invoice) {
    return { ok: false, status: 'pending', message: 'تعذّر التحقق من الدفع. حاول التحديث بعد قليل.' };
  }

  if (invoice.status !== 'paid') {
    await supabase
      .from('payments')
      .update({
        status: invoice.status === 'initiated' ? 'initiated' : 'failed',
        raw: invoice as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    return {
      ok: false,
      status: invoice.status === 'initiated' ? 'pending' : 'failed',
      message:
        invoice.status === 'initiated'
          ? 'الدفع قيد المعالجة. حدّث الصفحة بعد لحظات.'
          : 'لم تكتمل عملية الدفع. لم يُخصم أي مبلغ.',
    };
  }

  await applyPaidPayment(paymentId);
  return { ok: true, status: 'paid', message: 'تم الدفع بنجاح.' };
}

/**
 * يطبّق أثر الدفع الناجح: تفعيل المناسبة أو إنشاء/تمديد الاشتراك.
 * مصمَّمة لتكون آمنة عند التكرار (idempotent) لأنها تُستدعى من صفحة
 * الرجوع ومن الويب-هوك معاً.
 */
export async function applyPaidPayment(paymentId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (!payment || payment.status === 'paid') return;

  await supabase
    .from('payments')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', paymentId);

  if (!payment.plan_id) return;

  const { data: plan } = await supabase
    .from('plans')
    .select('*')
    .eq('id', payment.plan_id)
    .single();

  if (!plan) return;

  if (plan.billing_period === 'one_time') {
    if (payment.event_id) {
      await supabase
        .from('events')
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
          plan_id: plan.id,
        })
        .eq('id', payment.event_id);
    }
  } else {
    const months = plan.billing_period === 'yearly' ? 12 : 1;

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, current_period_end')
      .eq('user_id', payment.user_id)
      .eq('status', 'active')
      .maybeSingle();

    // التجديد يمدّد من نهاية الفترة الحالية إن كانت لم تنتهِ بعد
    const base =
      existing?.current_period_end && new Date(existing.current_period_end) > new Date()
        ? new Date(existing.current_period_end)
        : new Date();
    const periodEnd = new Date(base);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    if (existing) {
      await supabase
        .from('subscriptions')
        .update({
          plan_id: plan.id,
          current_period_end: periodEnd.toISOString(),
          // مرجع آخر دفعة مدّدت الاشتراك — وبه تُميَّز المحاكاة عند التنظيف
          provider_ref: payment.provider_payment_id,
          // النهاية تغيّرت ⇒ تذكير التجديد مسموح من جديد للفترة الجديدة
          renewal_notice_for: null,
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('subscriptions').insert({
        user_id: payment.user_id,
        plan_id: plan.id,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
        provider_ref: payment.provider_payment_id,
      });
    }
  }

  await supabase.from('audit_logs').insert({
    actor_type: 'system',
    actor_id: payment.user_id,
    action: 'payment.applied',
    target_table: 'payments',
    target_id: paymentId,
    meta: { plan: plan.code, amount: payment.amount_halalas },
  });
}

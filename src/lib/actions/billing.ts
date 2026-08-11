'use server';

import { headers } from 'next/headers';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { createInvoice, fetchInvoice, isMoyasarConfigured } from '@/lib/payments/moyasar';
import { SIMULATED_REF, paymentsTestMode } from '@/lib/payments/test-mode';
import {
  REJECTION_MESSAGES,
  applyDiscount,
  checkCode,
  normalizeCode,
  type DiscountResult,
} from '@/lib/payments/discounts';
import type { DiscountCode, Plan } from '@/lib/types/database';

export interface CheckoutResult {
  ok: boolean;
  error?: string;
  url?: string;
}

export interface CodePreview {
  ok: boolean;
  error?: string;
  /** المبلغ قبل الخصم وبعده بالهللات — للعرض قبل الضغط على الدفع */
  originalHalalas?: number;
  discountHalalas?: number;
  finalHalalas?: number;
  label?: string;
}

/**
 * قراءة كود وتقييمه لباقة بعينها.
 *
 * تُستدعى من صفحة الدفع لعرض السعر بعد الخصم — ثم يُعاد التحقق كاملاً
 * عند الشراء. ما يُعرض للعميل هنا لا يُبنى عليه شيء: من يستطيع نداء
 * هذا الإجراء يستطيع تزوير ردّه، فالسعر الحقيقي يُحسب هناك لا هنا.
 */
export async function previewCode(rawCode: string, planId: string): Promise<CodePreview> {
  const session = await requireUser();
  const service = createServiceClient();

  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: 'اكتب كود الخصم.' };

  const [{ data: plan }, { data: row }] = await Promise.all([
    service.from('plans').select('id, price_halalas').eq('id', planId).maybeSingle(),
    service.from('discount_codes').select('*').eq('code', code).maybeSingle(),
  ]);

  if (!plan) return { ok: false, error: 'الباقة غير متاحة.' };
  if (!row) return { ok: false, error: REJECTION_MESSAGES.not_found };

  const discountCode = row as DiscountCode;

  const { count: usesByUser } = await service
    .from('discount_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('code_id', discountCode.id)
    .eq('user_id', session.id);

  const rejection = checkCode(discountCode, plan, usesByUser ?? 0);
  if (rejection) return { ok: false, error: REJECTION_MESSAGES[rejection] };

  const result = applyDiscount(discountCode, plan.price_halalas);

  return {
    ok: true,
    originalHalalas: result.originalHalalas,
    discountHalalas: result.discountHalalas,
    finalHalalas: result.finalHalalas,
    label: discountCode.label ?? undefined,
  };
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
  rawCode?: string | null,
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

  /*
   * الخصم يُحسب هنا في الخادم من الباقة نفسها. ما يصل من المتصفح هو نص
   * الكود لا أكثر — ولو حُسب السعر هناك لصنع المشتري خصمه بنفسه.
   */
  const service = createServiceClient();

  let discountCode: DiscountCode | null = null;
  let discount: DiscountResult = {
    originalHalalas: typedPlan.price_halalas,
    discountHalalas: 0,
    finalHalalas: typedPlan.price_halalas,
    commissionHalalas: 0,
  };

  const code = rawCode ? normalizeCode(rawCode) : '';

  if (code) {
    const { data: row } = await service
      .from('discount_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (!row) return { ok: false, error: REJECTION_MESSAGES.not_found };
    discountCode = row as DiscountCode;

    const { count: usesByUser } = await service
      .from('discount_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('code_id', discountCode.id)
      .eq('user_id', session.id);

    const rejection = checkCode(discountCode, typedPlan, usesByUser ?? 0);
    if (rejection) return { ok: false, error: REJECTION_MESSAGES[rejection] };

    discount = applyDiscount(discountCode, typedPlan.price_halalas);
  }

  /*
   * سجل الدفع يُكتب بمفتاح الخدمة لا بهوية المستخدم.
   *
   * جدول payments عليه RLS بسياسة قراءة فقط بلا سياسة إدراج — فالكتابة
   * بهوية المتصفح كانت تُرفض، وأي شراء يفشل قبل أن يبدأ. ولا نفتح
   * سياسة إدراج: المبلغ يُشتق من الباقة في الخادم، ولا سبب يجعل
   * المتصفح ينشئ سجل دفع بنفسه أصلاً.
   */
  const { data: payment, error: paymentError } = await service
    .from('payments')
    .insert({
      user_id: session.id,
      event_id: typedPlan.billing_period === 'one_time' ? eventId : null,
      plan_id: typedPlan.id,
      amount_halalas: discount.finalHalalas,
      currency: typedPlan.currency,
      status: 'initiated',
      discount_code_id: discountCode?.id ?? null,
      discount_halalas: discount.discountHalalas,
      // المحاكاة توسم بالمزوّد لا بالمعرّف: المعرّف عليه فهرس فريد،
      // فقيمة ثابتة تعني أن أول شراء تجريبي هو آخر شراء تجريبي
      ...(testMode ? { provider: SIMULATED_REF, raw: { simulated: true } } : {}),
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    return { ok: false, error: 'تعذّر بدء عملية الدفع.' };
  }

  const origin = await siteOrigin();
  const callbackUrl = `${origin}/dashboard/billing/callback?payment=${payment.id}`;

  if (testMode) {
    await service
      .from('payments')
      .update({ provider_payment_id: `${SIMULATED_REF}:${payment.id}` })
      .eq('id', payment.id);
  }

  /*
   * خصم يبلغ كامل السعر لا يمرّ ببوابة الدفع: البوابات ترفض فاتورة
   * بصفر ريال. وهو استعمال مشروع — كود شريك أو تعويض عميل — فنفعّله
   * مباشرة بنفس دالة التفعيل، ويبقى مسجّلاً كدفعة بصفر لا كمنحة بلا أثر.
   */
  if (testMode || discount.finalHalalas === 0) {
    if (!testMode) {
      await service
        .from('payments')
        .update({ provider: 'discount', provider_payment_id: `discount:${payment.id}` })
        .eq('id', payment.id);
    }

    await applyPaidPayment(payment.id);
    return { ok: true, url: callbackUrl };
  }

  try {
    const invoice = await createInvoice({
      amountHalalas: discount.finalHalalas,
      currency: typedPlan.currency,
      description: `بكجات — ${typedPlan.name}${discountCode ? ` (${discountCode.code})` : ''}`,
      callbackUrl,
      metadata: {
        payment_id: payment.id,
        user_id: session.id,
        plan_code: typedPlan.code,
        event_id: eventId ?? '',
        discount_code: discountCode?.code ?? '',
      },
    });

    await service
      .from('payments')
      .update({ provider_payment_id: invoice.id, updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    return { ok: true, url: invoice.url };
  } catch (err) {
    await service
      .from('payments')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    // نسجّل التفاصيل للأدمن ولا نكشفها للمستخدم
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

  const simulated = payment.provider === SIMULATED_REF;

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

  await recordRedemption(payment, plan);

  await supabase.from('audit_logs').insert({
    actor_type: 'system',
    actor_id: payment.user_id,
    action: 'payment.applied',
    target_table: 'payments',
    target_id: paymentId,
    meta: { plan: plan.code, amount: payment.amount_halalas },
  });
}

/**
 * تسجيل استعمال كود الخصم بعد نجاح الدفع.
 *
 * الترتيب مقصود: نحجز الاستعمال بعد الدفع لا قبله، فالكود لا يُستهلك
 * بمن بدأ الشراء ثم تركه. والقيم تُنسخ هنا — تعديل الكود أو حذفه لاحقاً
 * لا يغيّر ما استُحق للمسوّق عن عملية تمّت.
 *
 * وعلى payment_id قيد تفرّد، فتكرار استدعاء التفعيل (من صفحة الرجوع
 * ومن الويب-هوك معاً) لا يحسب العملية مرتين.
 */
async function recordRedemption(
  payment: { id: string; user_id: string; discount_code_id: string | null; amount_halalas: number; discount_halalas: number },
  plan: { price_halalas: number },
): Promise<void> {
  if (!payment.discount_code_id) return;

  const supabase = createServiceClient();

  const { data: code } = await supabase
    .from('discount_codes')
    .select('commission_percent')
    .eq('id', payment.discount_code_id)
    .maybeSingle();

  const commissionPercent = Number(code?.commission_percent ?? 0);
  const commission = commissionPercent
    ? Math.floor((payment.amount_halalas * commissionPercent) / 100)
    : 0;

  const { error } = await supabase.from('discount_redemptions').insert({
    code_id: payment.discount_code_id,
    user_id: payment.user_id,
    payment_id: payment.id,
    original_halalas: plan.price_halalas,
    discount_halalas: payment.discount_halalas,
    paid_halalas: payment.amount_halalas,
    commission_halalas: commission,
  });

  // 23505 = هذه الدفعة مسجّلة أصلاً؛ لا نزيد العدّاد مرتين لها
  if (error) return;

  /*
   * الحجز الذرّي يمنع تجاوز السقف بمشتريين متزامنين. ولو رجع false —
   * أي نفد السقف بين لحظة التحقق ولحظة الدفع — لا نُبطل شيئاً: العميل
   * دفع فعلاً، وسحب ما اشتراه بسبب سباق داخلي عندنا ظلم له. يزيد
   * الاستعمال عن السقف بواحد ويظهر ذلك في التقرير.
   */
  await supabase.rpc('claim_discount_use', { p_code_id: payment.discount_code_id });
}

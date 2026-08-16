'use server';

import { revalidatePath } from 'next/cache';
import * as OTPAuth from 'otpauth';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { markAdmin2faPassed, requireAdmin, requireUser } from '@/lib/auth/session';
import { describeDbError } from '@/lib/db-errors';
import { logAdminAction } from '@/lib/audit';
import type { ActionResult } from '@/lib/actions/events';
import type { DesignConfig, DiscountCode } from '@/lib/types/database';
import type { Profile } from '@/lib/types/database';
import { isValidHex, normalizeHex, type Theme } from '@/lib/design/theme';
import { parseAppearance, type Appearance } from '@/lib/design/appearance';

const ISSUER = 'PKGAT';

// ===================== التحقق بخطوتين =====================

function buildTotp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** يولّد سرّاً جديداً للتحقق بخطوتين ويعيد رابط QR (لا يُفعّل قبل التأكيد) */
export async function beginTotpSetup(): Promise<{
  ok: boolean;
  error?: string;
  secret?: string;
  uri?: string;
}> {
  const session = await requireUser();
  if (!session.profile.is_super_admin) return { ok: false, error: 'غير مصرح.' };

  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({ totp_secret: secret, totp_enabled: false })
    .eq('id', session.id);

  if (error) return { ok: false, error: 'تعذّر إنشاء المفتاح.' };

  return {
    ok: true,
    secret,
    uri: buildTotp(secret, session.email).toString(),
  };
}

/** يؤكد الرمز — يفعّل التحقق أول مرة، أو يفتح جلسة الأدمن بعد ذلك */
export async function verifyTotp(token: string): Promise<ActionResult> {
  const session = await requireUser();
  if (!session.profile.is_super_admin) return { ok: false, error: 'غير مصرح.' };

  const secret = session.profile.totp_secret;
  if (!secret) return { ok: false, error: 'لم يُنشأ مفتاح تحقق بعد.' };

  const clean = token.replace(/\s/g, '');
  const totp = buildTotp(secret, session.email);
  // نسمح بنافذة ±٣٠ ثانية لفرق التوقيت بين الأجهزة
  const delta = totp.validate({ token: clean, window: 1 });

  if (delta === null) return { ok: false, error: 'الرمز غير صحيح أو انتهت صلاحيته.' };

  if (!session.profile.totp_enabled) {
    const supabase = await createClient();
    await supabase.from('profiles').update({ totp_enabled: true }).eq('id', session.id);
  }

  await markAdmin2faPassed(session.id);

  await logAdminAction('admin.2fa.verified', 'profiles', session.id);
  return { ok: true };
}

// ===================== إدارة المستخدمين =====================

export async function setUserSuspended(
  userId: string,
  suspended: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false, error: 'ما تقدر توقف حسابك أنت.' };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_suspended: suspended })
    .eq('id', userId);

  if (error) return { ok: false, error: 'تعذّر تغيير حالة الحساب.' };

  await logAdminAction(suspended ? 'user.suspended' : 'user.activated', 'profiles', userId);
  revalidatePath('/admin/users');
  return { ok: true };
}

/**
 * تعديل بيانات مستخدم من لوحة الأدمن.
 * تغيير البريد يمر عبر واجهة إدارة Supabase لأن البريد مخزّن في auth.users
 * وليس في جدول الملفات — ثم نزامن النسخة المحلية.
 */
export async function adminUpdateUser(
  userId: string,
  patch: { fullName?: string; phone?: string | null; email?: string },
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const profileUpdate: Partial<Profile> = { updated_at: new Date().toISOString() };

  if (patch.fullName !== undefined) {
    const name = patch.fullName.trim();
    if (!name) return { ok: false, error: 'الاسم مطلوب.' };
    profileUpdate.full_name = name;
  }

  if (patch.phone !== undefined) {
    profileUpdate.phone = patch.phone?.trim() || null;
  }

  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'صيغة البريد غير صحيحة.' };
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });

    if (authError) {
      return {
        ok: false,
        error: authError.message.includes('already')
          ? 'هذا البريد مستخدم في حساب آخر.'
          : 'تعذّر تغيير البريد.',
      };
    }

    profileUpdate.email = email;
  }

  const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', userId);
  if (error) return { ok: false, error: 'تعذّر حفظ البيانات.' };

  await logAdminAction('user.updated', 'profiles', userId, {
    fields: Object.keys(patch).join(','),
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

/**
 * تفعيل حساب يدوياً — يؤكّد البريد بلا انتظار ضغط المستخدم على الرابط.
 *
 * يُحتاج حين لا تصل رسالة التأكيد: مرشّح البريد ابتلعها، أو المستخدم
 * أخطأ في بريده وصحّحناه له، أو نُنشئ حساباً لعميل بأنفسنا.
 */
export async function adminConfirmEmail(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) return { ok: false, error: describeDbError(error, 'تعذّر تفعيل الحساب.') };

  await logAdminAction('user.email_confirmed', 'profiles', userId);
  revalidatePath('/admin/users');
  return { ok: true };
}

/**
 * إنشاء حساب من لوحة الأدمن.
 *
 * يُنشأ مؤكَّداً مباشرة: الأدمن ينشئه لعميل يعرفه، فانتظار رسالة تأكيد
 * لا معنى له — وهو أصلاً أكثر ما تعطّل في هذه المنصة.
 */
export async function adminCreateUser(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'صيغة البريد غير صحيحة.' };
  }
  if (!fullName) return { ok: false, error: 'الاسم مطلوب.' };
  if (input.password.length < 8) {
    return { ok: false, error: 'كلمة المرور ٨ أحرف على الأقل.' };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: error?.message.includes('already')
        ? 'هذا البريد مسجّل مسبقاً.'
        : 'تعذّر إنشاء الحساب.',
    };
  }

  // مُشغّل handle_new_user ينشئ الملف؛ نكمل ما لا يعرفه
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName, phone, email, updated_at: new Date().toISOString() })
    .eq('id', data.user.id);

  if (profileError) {
    return { ok: false, error: describeDbError(profileError, 'أُنشئ الحساب لكن تعذّر حفظ بياناته.') };
  }

  await logAdminAction('user.created', 'profiles', data.user.id, { email });
  revalidatePath('/admin/users');
  return { ok: true, id: data.user.id };
}

/**
 * حذف حساب نهائياً — ومعه مناسباته ومدعووه بحكم القيود المتسلسلة.
 *
 * لا رجعة فيه، ولهذا يُمنع الأدمن من حذف نفسه (فيبقى للمنصة أدمن واحد
 * على الأقل)، ومن حذف أدمن آخر إلا بعد نزع صلاحيته أولاً.
 */
export async function adminDeleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false, error: 'ما تقدر تحذف حسابك أنت.' };

  const supabase = createServiceClient();

  const { data: target } = await supabase
    .from('profiles')
    .select('email, is_super_admin')
    .eq('id', userId)
    .maybeSingle();

  if (target?.is_super_admin) {
    return { ok: false, error: 'انزع صلاحية الأدمن أولاً، ثم احذف الحساب.' };
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: 'تعذّر حذف الحساب.' };

  await logAdminAction('user.deleted', 'profiles', userId, { email: target?.email ?? '' });
  revalidatePath('/admin/users');
  return { ok: true };
}

/** منح صلاحية الأدمن أو نزعها — الحارس في قاعدة البيانات يمنع فعلها من المتصفح */
export async function adminSetSuperAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false, error: 'ما تقدر تغيّر صلاحيتك أنت.' };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_super_admin: isAdmin })
    .eq('id', userId);

  if (error) return { ok: false, error: describeDbError(error, 'تعذّر تغيير الصلاحية.') };

  await logAdminAction(isAdmin ? 'user.admin_granted' : 'user.admin_revoked', 'profiles', userId);
  revalidatePath('/admin/users');
  return { ok: true };
}

// ===================== منح الأدمن للمستخدمين =====================

/**
 * منح عضوية لمستخدم بدون دفع — للتجارب والحسابات الخاصة والتعويضات.
 *
 * يُلغى أي اشتراك فعّال سابق قبل إنشاء الجديد، وإلا تراكمت اشتراكات
 * متعددة فعّالة على نفس المستخدم وصار «أي واحد منها» هو المطبَّق.
 * `months = null` تعني عضوية دائمة بلا تاريخ انتهاء.
 */
export async function adminGrantMembership(
  userId: string,
  planId: string,
  months: number | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('id, name')
    .eq('id', planId)
    .maybeSingle();

  if (!plan) return { ok: false, error: 'الباقة غير موجودة.' };

  if (months !== null && (!Number.isInteger(months) || months < 1 || months > 120)) {
    return { ok: false, error: 'مدة العضوية لازم تكون بين شهر و١٢٠ شهراً.' };
  }

  await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('user_id', userId)
    .eq('status', 'active');

  const periodEnd =
    months === null
      ? null
      : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    plan_id: planId,
    status: 'active',
    current_period_end: periodEnd,
    // يميّز المنح اليدوي عن الاشتراكات المدفوعة في أي مراجعة لاحقة
    provider_ref: 'admin_grant',
  });

  if (error) return { ok: false, error: 'تعذّر منح العضوية.' };

  await logAdminAction('user.membership_granted', 'subscriptions', userId, {
    plan: plan.name,
    months: months === null ? 'دائمة' : String(months),
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

/** سحب العضوية الممنوحة — يلغي أي اشتراك فعّال للمستخدم */
export async function adminRevokeMembership(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) return { ok: false, error: 'تعذّر سحب العضوية.' };

  await logAdminAction('user.membership_revoked', 'subscriptions', userId);
  revalidatePath('/admin/users');
  return { ok: true };
}

/**
 * تحديد عدد دعوات مجانية خاص بمستخدم.
 *
 * الحصة تُنسخ داخل كل مناسبة لحظة إنشائها، فتغيير الملف وحده لا يمس
 * مناسباته القائمة. ولأن حالة الباركود في SQL تقرأ events.free_quota
 * مباشرة، لو حدّثنا الملف فقط لظهر للمستخدم أنه يقدر يضيف مدعوين بينما
 * باركوداتهم تخرج «غير مفعّلة» على الباب. لذلك نحدّث الاثنين معاً:
 * الملف للمناسبات القادمة، والمناسبات غير المدفوعة القائمة فوراً.
 */
export async function adminSetUserQuota(
  userId: string,
  quota: number | null,
): Promise<ActionResult> {
  await requireAdmin();

  if (quota !== null && (!Number.isInteger(quota) || quota < 0 || quota > 100000)) {
    return { ok: false, error: 'عدد الدعوات لازم يكون رقماً بين ٠ و١٠٠٠٠٠.' };
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('profiles')
    .update({ free_quota_override: quota, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return { ok: false, error: 'تعذّر حفظ عدد الدعوات.' };

  let updatedEvents = 0;
  if (quota !== null) {
    const { data } = await supabase
      .from('events')
      .update({ free_quota: quota })
      .eq('owner_id', userId)
      .eq('is_paid', false)
      .neq('status', 'archived')
      .select('id');

    updatedEvents = data?.length ?? 0;
  }

  await logAdminAction('user.quota_set', 'profiles', userId, {
    quota: quota === null ? 'الإعداد العام' : String(quota),
    events_updated: String(updatedEvents),
  });

  revalidatePath('/admin/users');
  return { ok: true, updatedEvents } as ActionResult & { updatedEvents: number };
}

/**
 * إعادة التجربة المجانية لمستخدم — تصفير دفتر استهلاكه.
 *
 * الدفتر لا ينقص أبداً من تلقاء نفسه: لا بحذف مدعو ولا بحذف مناسبة.
 * وهذا مقصود، لكنه يحتاج مخرجاً بشرياً — عميل جرّب وصار عنده عذر، أو
 * حساب اختبار. المخرج هنا: قرار أدمن صريح، مسجَّل في سجل الأحداث.
 *
 * مفتاح الخدمة وحده يمرّ من حارس الملف، فلا يستطيع المستخدم فعلها بنفسه.
 */
export async function adminResetFreeTrial(userId: string): Promise<ActionResult> {
  await requireAdmin();

  const supabase = createServiceClient();

  const { data: before } = await supabase
    .from('profiles')
    .select('free_guests_used')
    .eq('id', userId)
    .maybeSingle();

  const { error } = await supabase
    .from('profiles')
    .update({ free_guests_used: 0, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return { ok: false, error: 'تعذّر تصفير الاستهلاك.' };

  /*
   * الدفتر صار صفراً، لكن مدعويه القدامى ما زالوا يحملون أرقاماً كبيرة
   * فتبقى باركوداتهم «غير مفعّلة». نُعيد ترقيمهم من واحد ونرفع الدفتر
   * بعددهم، فتعود حالتهم مطابقة لحساب جديد بنفس عدد المدعوين.
   */
  const { data: freeEvents } = await supabase
    .from('events')
    .select('id')
    .eq('owner_id', userId)
    .eq('is_paid', false)
    .eq('is_demo', false);

  const ids = (freeEvents ?? []).map((e) => e.id);
  let restamped = 0;

  if (ids.length > 0) {
    const { data: guests } = await supabase
      .from('guests')
      .select('id')
      .in('event_id', ids)
      .order('created_at', { ascending: true });

    const rows = guests ?? [];
    for (let i = 0; i < rows.length; i += 1) {
      await supabase.from('guests').update({ free_seq: i + 1 }).eq('id', rows[i].id);
    }
    restamped = rows.length;

    if (restamped > 0) {
      await supabase
        .from('profiles')
        .update({ free_guests_used: restamped })
        .eq('id', userId);
    }
  }

  await logAdminAction('user.free_trial_reset', 'profiles', userId, {
    was: String(before?.free_guests_used ?? 0),
    now: String(restamped),
  });

  revalidatePath('/admin/users');
  return { ok: true, restamped } as ActionResult & { restamped: number };
}

// ===================== اختبار الدفع قبل ربط البوابة =====================

/**
 * تشغيل/إيقاف وضع اختبار الدفع.
 *
 * الإعداد وحده لا يكفي لتفعيله: الكود يتجاهله متى ضُبط مفتاح مُيسّر،
 * فالبوابة الحقيقية تُلغيه تلقائياً. ولهذا لا خطر من نسيانه مفتوحاً.
 */
export async function setPaymentsTestMode(enabled: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key: 'payments_test_mode',
      value: enabled,
      label: 'وضع اختبار الدفع: يحاكي شراءً ناجحاً بلا بوابة. يتعطّل تلقائياً متى رُبطت مُيسّر.',
      updated_at: new Date().toISOString(),
    });

  if (error) return { ok: false, error: 'تعذّر حفظ الإعداد.' };

  await logAdminAction(enabled ? 'payments.test_mode_on' : 'payments.test_mode_off', 'site_settings', null);
  revalidatePath('/admin/plans');
  revalidatePath('/dashboard/billing');
  return { ok: true };
}

/**
 * مسح كل أثر الشراء التجريبي.
 *
 * الاختبار يترك خلفه اشتراكات فعّالة ومناسبات مدفوعة لم يُدفع لها ريال.
 * لو بقيت بعد الإطلاق صارت حسابات مجانية دائمة بلا أن يلاحظها أحد —
 * فالتنظيف جزء من الاختبار لا خطوة اختيارية بعده.
 *
 * كل ما نشأ عن المحاكاة موسوم بـ«simulated»، فالتنظيف دقيق ولا يقترب
 * من أي دفعة حقيقية.
 */
export async function clearTestPayments(): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: payments } = await supabase
    .from('payments')
    .select('id, event_id')
    .eq('provider_payment_id', 'simulated');

  const rows = payments ?? [];
  const eventIds = rows.map((p) => p.event_id).filter((id): id is string => Boolean(id));

  // المناسبات ترجع غير مدفوعة — وباركوداتها بعد الحد ترجع «غير مفعّلة»
  if (eventIds.length > 0) {
    await supabase
      .from('events')
      .update({ is_paid: false, paid_at: null, plan_id: null })
      .in('id', eventIds);
  }

  const { data: subs } = await supabase
    .from('subscriptions')
    .delete()
    .eq('provider_ref', 'simulated')
    .select('id');

  await supabase.from('payments').delete().eq('provider_payment_id', 'simulated');

  await logAdminAction('payments.test_data_cleared', 'payments', null, {
    payments: String(rows.length),
    events: String(eventIds.length),
    subscriptions: String(subs?.length ?? 0),
  });

  revalidatePath('/admin/plans');
  revalidatePath('/dashboard');
  return {
    ok: true,
    cleared: {
      payments: rows.length,
      events: eventIds.length,
      subscriptions: subs?.length ?? 0,
    },
  } as ActionResult & { cleared: { payments: number; events: number; subscriptions: number } };
}

// ===================== أكواد الخصم والمسوّقين =====================

export interface DiscountInput {
  code: string;
  label: string;
  kind: 'percent' | 'fixed';
  /** نسبة ١–١٠٠ حين percent، وريالات حين fixed */
  value: number;
  planIds: string[];
  maxUses: number | null;
  maxUsesPerUser: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  marketerName: string;
  commissionPercent: number | null;
}

/** يتحقق من المدخلات ويحوّل الريالات لهللات — القيمة تُخزَّن بالهللات دائماً */
function cleanDiscount(input: DiscountInput): { error?: string; row?: Partial<DiscountCode> } {
  const code = input.code.trim().replace(/\s+/g, '').toUpperCase();

  if (code.length < 3) return { error: 'الكود ٣ أحرف على الأقل.' };
  if (code.length > 32) return { error: 'الكود طويل. اختصره في ٣٢ حرفاً.' };

  if (!Number.isFinite(input.value) || input.value <= 0) {
    return { error: 'قيمة الخصم لازم تكون أكبر من صفر.' };
  }

  if (input.kind === 'percent' && input.value > 100) {
    return { error: 'نسبة الخصم لا تتجاوز ١٠٠٪.' };
  }

  if (input.maxUses !== null && (!Number.isInteger(input.maxUses) || input.maxUses < 1)) {
    return { error: 'عدد الاستعمالات لازم يكون رقماً صحيحاً، أو اتركه فارغاً لبلا حد.' };
  }

  if (!Number.isInteger(input.maxUsesPerUser) || input.maxUsesPerUser < 1) {
    return { error: 'عدد استعمالات المستخدم الواحد لازم يكون ١ فأكثر.' };
  }

  if (
    input.commissionPercent !== null &&
    (input.commissionPercent < 0 || input.commissionPercent > 100)
  ) {
    return { error: 'نسبة العمولة بين ٠ و١٠٠.' };
  }

  if (input.startsAt && input.expiresAt && new Date(input.expiresAt) <= new Date(input.startsAt)) {
    return { error: 'تاريخ الانتهاء لازم يكون بعد تاريخ البداية.' };
  }

  return {
    row: {
      code,
      label: input.label.trim() || null,
      kind: input.kind,
      // الثابت يُدخل بالريالات ويُخزَّن بالهللات؛ والنسبة تبقى كما هي
      value: input.kind === 'fixed' ? Math.round(input.value * 100) : Math.round(input.value),
      plan_ids: input.planIds,
      max_uses: input.maxUses,
      max_uses_per_user: input.maxUsesPerUser,
      starts_at: input.startsAt || null,
      expires_at: input.expiresAt || null,
      is_active: input.isActive,
      marketer_name: input.marketerName.trim() || null,
      commission_percent: input.commissionPercent,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function saveDiscountCode(
  id: string | null,
  input: DiscountInput,
): Promise<ActionResult> {
  await requireAdmin();

  const { error: invalid, row } = cleanDiscount(input);
  if (invalid || !row) return { ok: false, error: invalid };

  const supabase = createServiceClient();

  const { error } = id
    ? await supabase.from('discount_codes').update(row).eq('id', id)
    : await supabase.from('discount_codes').insert(row);

  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'فيه كود بنفس الاسم.' : describeDbError(error, 'تعذّر الحفظ.'),
    };
  }

  await logAdminAction(id ? 'discount.updated' : 'discount.created', 'discount_codes', id, {
    code: String(row.code),
  });
  revalidatePath('/admin/discounts');
  return { ok: true };
}

export async function setDiscountActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('discount_codes')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: 'تعذّر تغيير الحالة.' };

  await logAdminAction(active ? 'discount.activated' : 'discount.deactivated', 'discount_codes', id);
  revalidatePath('/admin/discounts');
  return { ok: true };
}

/**
 * حذف كود.
 *
 * الاستعمالات السابقة تُحذف معه (on delete cascade)، ومعها ما يثبت
 * استحقاق المسوّق. ولهذا نمنع الحذف متى استُعمل الكود ونوجّه للإيقاف:
 * الإيقاف يمنع الاستعمال الجديد ويُبقي التاريخ.
 */
export async function deleteDiscountCode(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { count } = await supabase
    .from('discount_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('code_id', id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: 'هذا الكود استُعمل فعلاً — أوقفه بدل حذفه حتى يبقى سجل استعمالاته وعمولته.',
    };
  }

  const { error } = await supabase.from('discount_codes').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر الحذف.' };

  await logAdminAction('discount.deleted', 'discount_codes', id);
  revalidatePath('/admin/discounts');
  return { ok: true };
}

// ===================== إدارة المحتوى (CMS) =====================

export async function updateContent(key: string, value: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('site_content')
    .update({ value, updated_at: new Date().toISOString(), updated_by: admin.id })
    .eq('key', key);

  if (error) return { ok: false, error: 'تعذّر حفظ المحتوى.' };

  await logAdminAction('content.updated', 'site_content', null, { key });
  revalidatePath('/admin/content');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function createContentKey(input: {
  key: string;
  page: string;
  label: string;
  kind: string;
  value: unknown;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const key = input.key.trim();
  if (!/^[a-z0-9_.]+$/.test(key)) {
    return { ok: false, error: 'المفتاح: حروف إنجليزية صغيرة وأرقام و . _ فقط.' };
  }

  const { error } = await supabase.from('site_content').insert({
    key,
    page: input.page,
    label: input.label,
    kind: input.kind as 'text' | 'richtext' | 'image' | 'list',
    value: input.value,
  });

  if (error) {
    return { ok: false, error: error.code === '23505' ? 'المفتاح موجود مسبقاً.' : 'تعذّر الإنشاء.' };
  }

  revalidatePath('/admin/content');
  return { ok: true };
}

export async function deleteContentKey(key: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('site_content').delete().eq('key', key);
  if (error) return { ok: false, error: 'تعذّر الحذف.' };

  await logAdminAction('content.deleted', 'site_content', null, { key });
  revalidatePath('/admin/content');
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** يحفظ ألوان الهوية — تُطبَّق على كل الصفحات فوراً */
export async function saveTheme(theme: Theme): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  for (const [key, value] of Object.entries(theme)) {
    if (!isValidHex(value)) {
      return { ok: false, error: `اللون «${key}» غير صالح. استخدم صيغة #RRGGBB.` };
    }
  }

  const clean: Theme = {
    primary: normalizeHex(theme.primary),
    canvas: normalizeHex(theme.canvas),
    sand: normalizeHex(theme.sand),
    ink: normalizeHex(theme.ink),
  };

  const { error } = await supabase
    .from('site_settings')
    .upsert(
      { key: 'theme', value: clean, label: 'ألوان هوية الموقع', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) return { ok: false, error: 'تعذّر حفظ الألوان.' };

  await logAdminAction('theme.updated', 'site_settings', null, { ...clean });
  // الألوان تُحقن في التخطيط الجذري، فنُحدّث كل الصفحات
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * يحفظ مصدر أرقام الإثبات الاجتماعي وحدَّه الأدنى.
 *
 * القيم محصورة هنا لا تُقبل كما جاءت: الوضع أحد اثنين، والحدّ عدد
 * صحيح غير سالب — وهو يُكتب في سمةٍ يقرأها الموقع العام.
 */
export async function saveSocialProofMode(
  mode: 'auto' | 'manual',
  min: number,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const cleanMode = mode === 'manual' ? 'manual' : 'auto';
  const cleanMin = Number.isFinite(min) && min >= 0 ? Math.floor(min) : 25;

  const { error } = await supabase.from('site_settings').upsert(
    [
      {
        key: 'social_proof_mode',
        value: cleanMode,
        label: 'مصدر أرقام الإثبات: auto = تُحسب من قاعدة البيانات · manual = ما تكتبه أنت',
        updated_at: new Date().toISOString(),
      },
      {
        key: 'social_proof_min',
        value: cleanMin,
        label: 'الحد الأدنى للمناسبات قبل إظهار الشريط (في الوضع التلقائي فقط)',
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'key' },
  );

  if (error) return { ok: false, error: 'تعذّر حفظ الإعداد.' };

  await logAdminAction('social_proof.updated', 'site_settings', null, {
    mode: cleanMode,
    min: cleanMin,
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * يحفظ مظهر الموقع: الوضع الليلي والشكل الزجاجي.
 *
 * نمرّ بـ parseAppearance ولا نثق بما وصل: القيم محصورة في قوائم
 * معلومة، وأي قيمة غريبة ترتدّ إلى الافتراضي بدل أن تُكتب في السمة
 * data-surface على عنصر html.
 */
export async function saveAppearance(appearance: Appearance): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const clean = parseAppearance(appearance);

  const { error } = await supabase
    .from('site_settings')
    .upsert(
      {
        key: 'appearance',
        value: clean,
        label: 'مظهر الموقع (الوضع الليلي والشكل الزجاجي)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );

  if (error) return { ok: false, error: 'تعذّر حفظ المظهر.' };

  await logAdminAction('appearance.updated', 'site_settings', null, { ...clean });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function updateSetting(key: string, value: unknown): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('site_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);

  if (error) return { ok: false, error: 'تعذّر حفظ الإعداد.' };

  await logAdminAction('setting.updated', 'site_settings', null, { key });
  revalidatePath('/admin/content');
  return { ok: true };
}

// ===================== القوالب الجاهزة =====================

export async function saveTemplate(input: {
  id?: string;
  name: string;
  categoryId: string | null;
  backgroundUrl: string;
  thumbnailUrl: string | null;
  config: Partial<DesignConfig>;
  isActive: boolean;
  sortOrder: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'اسم القالب مطلوب.' };
  if (!input.backgroundUrl) return { ok: false, error: 'صورة خلفية القالب مطلوبة.' };

  const payload = {
    name,
    category_id: input.categoryId,
    background_url: input.backgroundUrl,
    thumbnail_url: input.thumbnailUrl,
    config: input.config,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };

  const { error } = input.id
    ? await supabase.from('templates').update(payload).eq('id', input.id)
    : await supabase.from('templates').insert(payload);

  if (error) return { ok: false, error: 'تعذّر حفظ القالب.' };

  await logAdminAction(input.id ? 'template.updated' : 'template.created', 'templates', input.id ?? null);
  revalidatePath('/admin/templates');
  // خطوة التصميم عند المستخدمين تقرأ نفس الجدول
  revalidatePath('/dashboard/events', 'layout');
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر حذف القالب.' };

  await logAdminAction('template.deleted', 'templates', id);
  revalidatePath('/admin/templates');
  revalidatePath('/dashboard/events', 'layout');
  return { ok: true };
}

export async function saveTemplateCategory(input: {
  id?: string;
  name: string;
  slug: string;
  sortOrder: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: 'المعرّف: حروف إنجليزية صغيرة وأرقام و - فقط.' };
  }

  const payload = { name: input.name.trim(), slug, sort_order: input.sortOrder };

  const { error } = input.id
    ? await supabase.from('template_categories').update(payload).eq('id', input.id)
    : await supabase.from('template_categories').insert(payload);

  if (error) {
    return { ok: false, error: error.code === '23505' ? 'المعرّف مستخدم مسبقاً.' : 'تعذّر الحفظ.' };
  }

  revalidatePath('/admin/templates');
  return { ok: true };
}

export async function deleteTemplateCategory(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('template_categories').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر حذف التصنيف.' };

  revalidatePath('/admin/templates');
  return { ok: true };
}

// ===================== معرض الأعمال =====================

export async function saveGalleryItem(input: {
  id?: string;
  title: string;
  description: string | null;
  imageUrl: string;
  eventType: string | null;
  isPublished: boolean;
  sortOrder: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'عنوان العمل مطلوب.' };
  if (!input.imageUrl) return { ok: false, error: 'صورة العمل مطلوبة.' };

  const payload = {
    title,
    description: input.description,
    image_url: input.imageUrl,
    event_type: input.eventType,
    is_published: input.isPublished,
    sort_order: input.sortOrder,
  };

  const { error } = input.id
    ? await supabase.from('gallery_items').update(payload).eq('id', input.id)
    : await supabase.from('gallery_items').insert(payload);

  if (error) return { ok: false, error: 'تعذّر حفظ العمل.' };

  await logAdminAction(input.id ? 'gallery.updated' : 'gallery.created', 'gallery_items', input.id ?? null);
  revalidatePath('/admin/gallery');
  revalidatePath('/gallery');
  return { ok: true };
}

export async function deleteGalleryItem(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('gallery_items').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر الحذف.' };

  await logAdminAction('gallery.deleted', 'gallery_items', id);
  revalidatePath('/admin/gallery');
  revalidatePath('/gallery');
  return { ok: true };
}

// ===================== الباقات =====================

export async function savePlan(input: {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  priceHalalas: number;
  billingPeriod: string;
  guestsLimit: number | null;
  features: string[];
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const code = input.code.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(code)) {
    return { ok: false, error: 'رمز الباقة: حروف إنجليزية صغيرة وأرقام و _ فقط.' };
  }
  if (input.priceHalalas < 0) return { ok: false, error: 'السعر لا يمكن أن يكون سالباً.' };

  const payload = {
    code,
    name: input.name.trim(),
    description: input.description,
    price_halalas: Math.round(input.priceHalalas),
    billing_period: input.billingPeriod as 'one_time' | 'monthly' | 'yearly',
    guests_limit: input.guestsLimit,
    features: input.features,
    is_active: input.isActive,
    is_featured: input.isFeatured,
    sort_order: input.sortOrder,
  };

  const { error } = input.id
    ? await supabase.from('plans').update(payload).eq('id', input.id)
    : await supabase.from('plans').insert(payload);

  if (error) {
    return { ok: false, error: error.code === '23505' ? 'رمز الباقة مستخدم.' : 'تعذّر الحفظ.' };
  }

  await logAdminAction(input.id ? 'plan.updated' : 'plan.created', 'plans', input.id ?? null);
  revalidatePath('/admin/plans');
  revalidatePath('/pricing');
  return { ok: true };
}

export async function deletePlan(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('plans').delete().eq('id', id);
  if (error) {
    return { ok: false, error: 'تعذّر الحذف — قد تكون الباقة مرتبطة بمدفوعات. عطّلها بدل حذفها.' };
  }

  await logAdminAction('plan.deleted', 'plans', id);
  revalidatePath('/admin/plans');
  revalidatePath('/pricing');
  return { ok: true };
}

// ===================== المناسبات (تدخّل الأدمن) =====================

export async function adminSetEventPaid(
  eventId: string,
  isPaid: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('events')
    .update({ is_paid: isPaid, paid_at: isPaid ? new Date().toISOString() : null })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'تعذّر التحديث.' };

  await logAdminAction('event.paid_override', 'events', eventId, { is_paid: isPaid });
  revalidatePath('/admin/events');
  return { ok: true };
}

export async function adminDeleteEvent(eventId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) return { ok: false, error: 'تعذّر الحذف.' };

  await logAdminAction('event.deleted', 'events', eventId);
  revalidatePath('/admin/events');
  return { ok: true };
}

// ===================== الخطوط المرفوعة =====================

/**
 * حفظ خط مرفوع.
 *
 * اسم العائلة فريد في قاعدة البيانات: خطّان بنفس الاسم في صفحة واحدة
 * يتعارضان ويظهر أحدهما مكان الآخر بلا خطأ ظاهر.
 */
export async function saveCustomFont(input: {
  id?: string;
  family: string;
  label: string;
  fileUrl: string;
  format: string;
  weight: number;
  isActive: boolean;
  sortOrder: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const family = input.family.trim();
  const label = input.label.trim();

  if (!family) return { ok: false, error: 'اسم الخط مطلوب.' };
  if (!label) return { ok: false, error: 'الاسم المعروض مطلوب.' };
  if (!input.fileUrl) return { ok: false, error: 'ارفع ملف الخط أولاً.' };

  // الاسم يدخل في font-family داخل CSS ووسم الكانفس — نمنع المحارف
  // التي تكسر الصيغة أو تسمح بالحقن
  if (!/^[\w؀-ۿ][\w؀-ۿ\s-]{0,48}$/.test(family)) {
    return { ok: false, error: 'اسم الخط يقبل حروفاً وأرقاماً ومسافات وشرطات فقط.' };
  }

  const payload = {
    family,
    label,
    file_url: input.fileUrl,
    format: input.format,
    weight: Math.max(100, Math.min(900, input.weight)),
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };

  const { error } = input.id
    ? await supabase.from('custom_fonts').update(payload).eq('id', input.id)
    : await supabase.from('custom_fonts').insert(payload);

  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? 'يوجد خط بنفس الاسم. اختر اسماً غيره.'
        : describeDbError(error, 'تعذّر حفظ الخط.'),
    };
  }

  await logAdminAction(input.id ? 'font.updated' : 'font.created', 'custom_fonts', input.id ?? null);
  revalidatePath('/admin/fonts');
  revalidatePath('/dashboard/events', 'layout');
  return { ok: true };
}

export async function deleteCustomFont(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('custom_fonts').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر حذف الخط.' };

  await logAdminAction('font.deleted', 'custom_fonts', id);
  revalidatePath('/admin/fonts');
  revalidatePath('/dashboard/events', 'layout');
  return { ok: true };
}

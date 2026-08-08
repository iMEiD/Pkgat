'use server';

import { revalidatePath } from 'next/cache';
import * as OTPAuth from 'otpauth';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { markAdmin2faPassed, requireAdmin, requireUser } from '@/lib/auth/session';
import { describeDbError } from '@/lib/db-errors';
import type { ActionResult } from '@/lib/actions/events';
import type { DesignConfig } from '@/lib/types/database';
import type { Profile } from '@/lib/types/database';
import { isValidHex, normalizeHex, type Theme } from '@/lib/design/theme';

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

async function logAdminAction(
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

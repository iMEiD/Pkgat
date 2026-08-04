'use server';

import { revalidatePath } from 'next/cache';
import * as OTPAuth from 'otpauth';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { markAdmin2faPassed, requireAdmin, requireUser } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/actions/events';
import type { DesignConfig } from '@/lib/types/database';
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
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر حذف القالب.' };

  await logAdminAction('template.deleted', 'templates', id);
  revalidatePath('/admin/templates');
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

import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  type Appearance,
} from '@/lib/design/appearance';
import { DEFAULT_THEME, parseTheme, type Theme } from '@/lib/design/theme';

export type ContentMap = Record<string, unknown>;

/**
 * يقرأ محتوى صفحة من جدول site_content.
 * كل نص في الموقع يُخزَّن كبيانات، فيقدر الأدمن يعدّله من لوحته
 * بدون أي تعديل على الكود.
 *
 * إن تعذّر الوصول لقاعدة البيانات نُرجع خريطة فارغة، وتتكفّل القيم
 * الاحتياطية في دالة `text` بإبقاء الصفحة قابلة للعرض.
 */
export async function getPageContent(...pages: string[]): Promise<ContentMap> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('site_content')
      .select('key, value')
      .in('page', pages)
      .order('sort_order');

    if (error || !data) return {};
    return Object.fromEntries(data.map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}

/** قيمة نصية مع قيمة احتياطية */
export function text(map: ContentMap, key: string, fallback = ''): string {
  const v = map[key];
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/** قيمة قائمة مع قيمة احتياطية */
export function list<T>(map: ContentMap, key: string, fallback: T[] = []): T[] {
  const v = map[key];
  return Array.isArray(v) ? (v as T[]) : fallback;
}

export async function getSettings(): Promise<Record<string, unknown>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('site_settings').select('key, value');
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

/** هوية الموقع اللونية كما حفظها الأدمن — أو الافتراضية */
export async function getTheme(): Promise<Theme> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'theme')
      .maybeSingle();

    return parseTheme(data?.value);
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * مظهر الموقع كما ضبطه الأدمن — أو الافتراضي.
 *
 * والافتراضي هنا هو حال الموقع اليوم بالضبط، فالفشل في القراءة (قبل
 * تنفيذ الترحيل مثلاً) يُبقي الموقع كما هو ولا يقلبه.
 */
export async function getAppearance(): Promise<Appearance> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'appearance')
      .maybeSingle();

    return parseAppearance(data?.value);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export async function getFreeQuota(): Promise<number> {
  const settings = await getSettings();
  const raw = settings.free_guest_quota;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

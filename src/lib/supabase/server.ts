import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@/lib/types/database';

/**
 * عميل Supabase للخادم — يقرأ جلسة المستخدم من الكوكيز ويحترم سياسات RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // تُستدعى من Server Component — التحديث يتم في الـ middleware
          }
        },
      },
    },
  );
}

/**
 * عميل بمفتاح الخدمة — يتجاوز RLS.
 * يُستخدم فقط في مسارات الخادم التي تطبّق تحققها الخاص
 * (مصادقة مسؤولي المسح، ويب-هوك الدفع، عمليات الأدمن).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط في متغيرات البيئة');
  }

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

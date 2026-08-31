import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * يحدّث جلسة Supabase على كل طلب حتى لا تنتهي أثناء استخدام اللوحة.
 * لوحة المسح مستثناة لأنها تستخدم مصادقة مستقلة (كوكي موقّع خاص بها).
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    /*
     * كل المسارات عدا: الملفات الثابتة، الصور، والأيقونات،
     * ولوحة المسح (/scan) التي لا تعتمد على جلسة Supabase،
     * وصفحة الدعوة (/i) — يفتحها من لا حساب له، وتحديثُ جلسةٍ
     * غير موجودة رحلةٌ زائدة إلى Supabase عن كل مدعو. وهي الصفحة
     * الوحيدة التي قد تُفتح خمسمئة مرة في دقيقة واحدة.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|scan|i/|api/scan|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

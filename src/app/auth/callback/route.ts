import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

/**
 * نقطة رجوع تأكيد البريد وإعادة تعيين كلمة المرور.
 *
 * Supabase يرسل رابط البريد بأحد شكلين حسب القالب وإصدار المشروع:
 *
 *   ?code=…                     تدفّق PKCE
 *   ?token_hash=…&type=recovery رمز مُجزّأ — وهو ما ترسله قوالب البريد
 *                               المخصّصة عادةً
 *
 * كان هذا المسار يتعامل مع `code` وحده، فأي رابط بالشكل الثاني يسقط
 * إلى /login بلا رسالة — وهو ما يجعل رابط استعادة كلمة المرور يبدو
 * وكأنه «يفتح صفحة تسجيل الدخول».
 *
 * وتدفّق ثالث (implicit) يضع الرمز في جزء العنوان بعد # ولا يصل الخادم
 * إطلاقاً؛ تتكفّل به صفحة /reset-password في المتصفح.
 */

const OTP_TYPES = new Set<EmailOtpType>([
  'recovery',
  'signup',
  'invite',
  'magiclink',
  'email_change',
  'email',
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const supabaseError = searchParams.get('error_description') ?? searchParams.get('error');

  const type = rawType && OTP_TYPES.has(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;

  // استعادة كلمة المرور تنتهي دائماً بصفحة تعيينها، مهما كان next
  const requested = searchParams.get('next') ?? '/dashboard';
  const safeNext =
    type === 'recovery' ? '/reset-password' : requested.startsWith('/') ? requested : '/dashboard';

  // Supabase قد يشرح سبب الرفض بنفسه — ننقله بدل ابتلاعه
  if (supabaseError) {
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);

    /*
     * وصولنا هنا ومعنا `code` يعني أن Supabase تحقّق من الرمز ونجح —
     * وإلا لأعادنا برسالة خطأ لا برمز. أي أن **البريد تأكّد فعلاً**،
     * والفاشل هو فتح الجلسة وحدها: رمز PKCE مرتبط بالمتصفح الذي بدأ
     * التسجيل، ويُستهلك مرة واحدة (وقد يستهلكه فاحص روابط البريد قبل
     * أن يضغط المستخدم).
     *
     * فرقٌ جوهري في الرسالة: «الرابط لم يعمل» تُفزع من تأكّد حسابه
     * فعلاً وتجعله يعيد التسجيل. الصحيح أن نقول له: تم التأكيد، سجّل
     * دخولك.
     */
    const recovering = type === 'recovery' || requested.startsWith('/reset-password');
    return NextResponse.redirect(
      `${origin}/login?error=${recovering ? 'device' : 'confirmed'}`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=invalid`);
}

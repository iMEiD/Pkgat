'use client';

import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';

/**
 * تعذّر تحميل لوحة المسح لسبب عابر.
 *
 * لا تُخرج مسؤول الاستقبال ولا تعيده لصفحة الدخول: جلسته سليمة، والخلل
 * في الطريق لا فيه. زرّ إعادة المحاولة يكفي غالباً — وهو على الباب
 * والضيوف واقفون، فأسرع طريق للعودة أهم من أي شرح.
 */
export function ScanUnavailable({ reason }: { reason: 'connection' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-center text-white">
      <LogoMark className="h-14 w-14 rounded-3xl" />

      <h1 className="mt-5 font-display text-xl font-bold">تعذّر تحميل لوحة المسح</h1>

      <p className="mt-2.5 max-w-xs text-sm leading-7 text-white/65">
        {reason === 'connection'
          ? 'ما قدرنا نوصل للخادم الآن. تأكد من الشبكة وأعد المحاولة — دخولك ما زال ساري ولا تحتاج تسجّل من جديد.'
          : 'صار خلل غير متوقّع. أعد المحاولة.'}
      </p>

      <Button className="mt-6" size="lg" onClick={() => window.location.reload()}>
        أعد المحاولة
      </Button>

      <a href="/scan/login" className="pk-tap mt-5 text-xs text-white/45 hover:text-white/70">
        تسجيل دخول من جديد
      </a>
    </div>
  );
}

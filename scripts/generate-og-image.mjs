/**
 * يولّد public/og.png — صورة معاينة الروابط عند المشاركة (واتساب، X، تيليجرام).
 *
 * لماذا صورة ثابتة لا توليد وقت التشغيل؟
 * توليدها وقت التشغيل عبر next/og يحتاج ملف خط عربي مُحمَّلاً في الحزمة،
 * وبدونه يظهر النص مربعات فارغة — وهو عطل لا يُكتشف إلا بعد المشاركة.
 * الصورة الثابتة تحمل بكسلاتها معها، فلا تتعلق بخط على الخادم.
 *
 * والخط يُقرأ من public/fonts محلياً لا من الشبكة: الصورة تُولَّد مرة
 * ثم تُرفع، فربطُها بطلب خارجي وقت التوليد يجعلها تخرج بخطٍّ احتياطي
 * إن تعثّرت الشبكة — ولا يُكتشف ذلك إلا بعد أول مشاركة.
 *
 * التشغيل (يحتاج playwright مثبّتاً مؤقتاً):
 *   npm i -D playwright && node scripts/generate-og-image.mjs && npm un playwright
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'og.png');

/** خط ثمانية مضمَّناً في الصفحة — لا طلب شبكة وقت التوليد */
const font = (file) =>
  readFileSync(join(process.cwd(), 'public', 'fonts', 'thmanyah', file)).toString('base64');

const SANS = font('thmanyah-sans-Regular.woff2');
const BOLD = font('thmanyah-sans-Bold.woff2');
const DISPLAY = font('thmanyah-serif-display-Bold.woff2');

const html = `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
  @font-face { font-family:'TS'; src:url(data:font/woff2;base64,${SANS}) format('woff2'); font-weight:400; }
  @font-face { font-family:'TS'; src:url(data:font/woff2;base64,${BOLD}) format('woff2'); font-weight:700; }
  @font-face { font-family:'TD'; src:url(data:font/woff2;base64,${DISPLAY}) format('woff2'); font-weight:700; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1200px; height:630px; display:flex; flex-direction:column;
    justify-content:center; gap:34px; padding:80px;
    background:
      radial-gradient(900px 460px at 88% 8%, rgba(255,107,74,.42), transparent 62%),
      radial-gradient(760px 420px at 6% 96%, rgba(23,190,148,.40), transparent 62%),
      #6D4AFF;
    color:#FFFDF9; font-family:'TS', sans-serif;
  }
  .brand { display:flex; align-items:center; gap:22px; }
  .mark { width:96px; height:96px; border-radius:26px; background:#FFFDF9; display:grid; place-items:center; }
  .name { font-family:'TD'; font-size:64px; font-weight:700; }
  .en { font-size:22px; letter-spacing:11px; opacity:.72; direction:ltr; margin-top:8px; }
  h1 { font-family:'TD'; font-size:60px; line-height:1.32; font-weight:700; max-width:1040px; }
  p  { font-size:33px; line-height:1.55; opacity:.9; max-width:940px; }
  .chips { display:flex; gap:14px; margin-top:6px; }
  .chip { font-size:24px; padding:12px 26px; border-radius:999px;
          background:rgba(255,253,249,.16); border:1px solid rgba(255,253,249,.28); }
</style></head><body>
  <div class="brand">
    <div class="mark">
      <svg viewBox="0 0 64 64" width="62" height="62" fill="none" stroke="#6D4AFF"
           stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 14h-4a5 5 0 0 0-5 5v4"/><path d="M41 14h4a5 5 0 0 1 5 5v4"/>
        <path d="M50 41v4a5 5 0 0 1-5 5h-4"/><path d="M23 50h-4a5 5 0 0 1-5-5v-4"/>
        <rect x="25" y="25" width="14" height="14" rx="4" fill="#6D4AFF" stroke="none"/></svg>
    </div>
    <div><div class="name">بكجات</div><div class="en">PKGAT</div></div>
  </div>

  <h1>كل مدعو بباركوده، وتعرف مين حضر</h1>
  <p>ارفع دعوتك بأي تصميم، ونولّد باركود دخول فريد لكل مدعو باسمه.</p>

  <div class="chips">
    <span class="chip">بدون تطبيق</span>
    <span class="chip">باركود لكل مدعو</span>
    <span class="chip">تقرير حضور</span>
  </div>
</body></html>`;

// المتصفح المثبّت في البيئة — عدّل المسار إن اختلف عندك
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(400);
writeFileSync(OUT, await page.screenshot({ type: 'png' }));
await browser.close();

console.log(`تم توليد ${OUT} بمقاس 1200×630.`);

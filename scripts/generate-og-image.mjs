/**
 * يولّد public/og.png — صورة معاينة الروابط عند المشاركة (واتساب، X، تيليجرام).
 *
 * لماذا صورة ثابتة لا توليد وقت التشغيل؟
 * توليدها وقت التشغيل عبر next/og يحتاج ملف خط عربي مُحمَّلاً في الحزمة،
 * وبدونه يظهر النص مربعات فارغة — وهو عطل لا يُكتشف إلا بعد المشاركة.
 * الصورة الثابتة تحمل بكسلاتها معها، فلا تتعلق بخط على الخادم.
 *
 * التشغيل (يحتاج playwright مثبّتاً مؤقتاً):
 *   npm i -D playwright && node scripts/generate-og-image.mjs && npm un playwright
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'og.png');

const html = `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1200px; height:630px; display:flex; flex-direction:column;
    justify-content:center; gap:34px; padding:80px;
    background:
      radial-gradient(900px 460px at 88% 8%, rgba(255,107,74,.42), transparent 62%),
      radial-gradient(760px 420px at 6% 96%, rgba(23,190,148,.40), transparent 62%),
      #6D4AFF;
    color:#FFFDF9; font-family:'DejaVu Sans', sans-serif;
  }
  .brand { display:flex; align-items:center; gap:22px; }
  .mark { width:96px; height:96px; border-radius:26px; background:#FFFDF9; display:grid; place-items:center; }
  .name { font-size:60px; font-weight:700; letter-spacing:-1px; }
  .en { font-size:23px; letter-spacing:11px; opacity:.72; direction:ltr; margin-top:6px; }
  h1 { font-size:58px; line-height:1.34; font-weight:700; max-width:1040px; }
  p  { font-size:33px; line-height:1.55; opacity:.9; max-width:940px; }
  .chips { display:flex; gap:14px; margin-top:6px; }
  .chip { font-size:24px; padding:12px 26px; border-radius:999px;
          background:rgba(255,253,249,.16); border:1px solid rgba(255,253,249,.28); }
</style></head><body>
  <div class="brand">
    <div class="mark">
      <svg viewBox="0 0 64 64" width="62" height="62"><g fill="#6D4AFF">
        <path d="M12 12h14v14H12V12Zm4 4v6h6v-6h-6Z"/><path d="M38 12h14v14H38V12Zm4 4v6h6v-6h-6Z"/>
        <path d="M12 38h14v14H12V38Zm4 4v6h6v-6h-6Z"/><rect x="38" y="38" width="6" height="6"/>
        <rect x="48" y="38" width="4" height="4"/><rect x="38" y="48" width="6" height="4"/>
        <rect x="46" y="46" width="6" height="6"/></g></svg>
    </div>
    <div><div class="name">بكجات</div><div class="en">PKGAT</div></div>
  </div>

  <h1>دعوات إلكترونية بباركود دخول</h1>
  <p>صمّم دعوتك، ولّد باركود فريد لكل مدعو، وتحكّم بالدخول من جوالك.</p>

  <div class="chips">
    <span class="chip">بدون تطبيق</span>
    <span class="chip">باركود فريد لكل مدعو</span>
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

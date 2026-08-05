/**
 * يحوّل خلفيات القوالب من SVG إلى JPEG:
 *  - الخلفية الكاملة 1080×1920 (تُرسم على الكانفس)
 *  - مصغّرة 360×640 (تظهر في شبكة اختيار القوالب)
 * JPEG بدل PNG لأن التدرّجات اللونية تضخّم PNG بلا فائدة — ولا نحتاج شفافية.
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [, , SRC, OUT] = process.argv;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const files = readdirSync(SRC).filter((f) => f.endsWith('.svg'));

for (const file of files) {
  const svg = readFileSync(join(SRC, file), 'utf8');
  const slug = basename(file, '.svg');

  for (const [suffix, w, h, quality] of [
    ['', 1080, 1920, 86],
    ['-thumb', 360, 640, 80],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;overflow:hidden}
       svg{display:block;width:${w}px;height:${h}px}</style>${svg}`,
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: join(OUT, `${slug}${suffix}.jpg`), type: 'jpeg', quality });
    await page.close();
  }
  console.log('✓', slug);
}

await browser.close();

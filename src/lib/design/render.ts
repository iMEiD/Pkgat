import QRCode from 'qrcode';

import type { DesignConfig, TextLayer } from '@/lib/types/database';
import { ensureFontsLoaded, resolveWeight } from './fonts';

export interface RenderInput {
  design: DesignConfig;
  guestName: string;
  code: string;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/**
 * مصفوفة الباركود محفوظة لكل رمز.
 *
 * QRCode.create حساب لا رسم: نتيجته لا تتغيّر ما دام الرمز نفسه — لكنها
 * كانت تُحسب مع كل إطار أثناء سحب الباركود بالإصبع. تحريكه أو تكبيره
 * لا يغيّر مصفوفته، فحسابها مرة واحدة يكفي.
 */
const qrCache = new Map<string, { size: number; data: Uint8Array }>();

function qrMatrix(code: string) {
  const cached = qrCache.get(code);
  if (cached) return cached;

  const qr = QRCode.create(code, { errorCorrectionLevel: 'H' });
  const entry = { size: qr.modules.size, data: qr.modules.data };

  // سقف بسيط يمنع نمو الذاكرة في صفحة تولّد مئات الدعوات
  if (qrCache.size > 200) qrCache.clear();
  qrCache.set(code, entry);

  return entry;
}

/** يحمّل صورة الخلفية مرة واحدة ويعيد استخدامها لكل الدعوات */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    // ضروري حتى لا يتلوّث الكانفس ويمنع toBlob
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`تعذّر تحميل صورة التصميم: ${url}`));
    img.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

export function clearImageCache() {
  imageCache.clear();
}

/** يجمع كل الخطوط المستخدمة في التصميم لتحميلها دفعة واحدة قبل الرسم */
export function fontSpecsOf(design: DesignConfig) {
  const specs = [{ family: design.name.fontFamily, weight: design.name.weight }];
  for (const extra of design.extras ?? []) {
    specs.push({ family: extra.fontFamily, weight: extra.weight });
  }
  return specs;
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: Omit<TextLayer, 'id' | 'label' | 'text'>,
  text: string,
  W: number,
  H: number,
) {
  const px = Math.round(layer.fontSize * W);
  ctx.save();
  // الشفافية تُطبَّق على الطبقة كاملة — أنظف من دمجها في اللون نفسه،
  // فيبقى اللون المحفوظ hex بسيطاً يقرأه منتقي الألوان والقطّارة
  ctx.globalAlpha = layer.opacity ?? 1;
  // نثبّت الوزن على وجه متاح فعلاً حتى لا يزوّر المتصفح السُمك
  ctx.font = `${resolveWeight(layer.fontFamily, layer.weight)} ${px}px "${layer.fontFamily}", sans-serif`;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = 'middle';
  // الاتجاه لكل طبقة: كان مثبّتاً rtl فتنقلب الأرقام والنص اللاتيني
  ctx.direction = layer.direction ?? 'rtl';

  if (layer.letterSpacing && 'letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${layer.letterSpacing * px}px`;
  }

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = px * 0.14;
    ctx.shadowOffsetY = px * 0.05;
  }

  /*
   * أسطر متعددة: كان fillText سطراً واحداً فقط، فأي سطر جديد يكتبه
   * المستخدم يختفي من الدعوة النهائية. نوزّع الأسطر حول y بحيث يبقى
   * المقبض في مركز الكتلة لا في سطرها الأول.
   */
  const lines = text.split('\n');
  const lineStep = px * (layer.lineHeight ?? 1.35);
  const startY = layer.y * H - ((lines.length - 1) * lineStep) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, layer.x * W, startY + i * lineStep);
  });

  ctx.restore();
}

/** يرسم الباركود على الكانفس — مع دعم الزوايا الدائرية والخلفية الشفافة */
async function drawQr(
  ctx: CanvasRenderingContext2D,
  code: string,
  design: DesignConfig,
  W: number,
  H: number,
) {
  const q = design.qr;
  if (!q.visible) return;

  const box = Math.round(q.size * W);
  const left = Math.round(q.x * W - box / 2);
  const top = Math.round(q.y * H - box / 2);

  const qr = qrMatrix(code);
  const count = qr.size;
  const data = qr.data;
  const cell = box / (count + q.margin * 2);
  const offset = cell * q.margin;

  ctx.save();
  ctx.globalAlpha = q.opacity ?? 1;

  if (q.background !== 'transparent') {
    ctx.fillStyle = q.background;
    if (q.rounded) {
      roundRect(ctx, left, top, box, box, box * 0.06);
      ctx.fill();
    } else {
      ctx.fillRect(left, top, box, box);
    }
  }

  ctx.fillStyle = q.foreground;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!data[row * count + col]) continue;
      const x = left + offset + col * cell;
      const y = top + offset + row * cell;

      // مربعات الكشف الثلاث (Finder patterns) تبقى حادّة دائماً — تدويرها
      // يكسر اكتشاف الباركود ويجعله غير قابل للمسح.
      if (q.rounded && !isFinderModule(row, col, count)) {
        roundRect(ctx, x, y, cell + 0.6, cell + 0.6, cell * 0.28);
        ctx.fill();
      } else {
        // +0.6 يمنع خطوط شعرية بيضاء بين الوحدات بعد التقريب
        ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
      }
    }
  }

  ctx.restore();
}

/** هل هذه الوحدة ضمن أحد مربعات الكشف الثلاثة (٧×٧ في الزوايا)؟ */
function isFinderModule(row: number, col: number, count: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= count - 7;
  const inBottomLeft = row >= count - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * يرسم دعوة كاملة على كانفس.
 *
 * الخطوط تُحمَّل قبل أي عملية رسم — سواء في المعاينة الحية أو التوليد النهائي —
 * لضمان أن النص يُرسم بالخط المختار فعلاً وليس بخط بديل.
 */
export async function renderInvitation(
  input: RenderInput,
  target?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const { design, guestName, code } = input;
  const W = design.width || 1080;
  const H = design.height || 1920;

  await ensureFontsLoaded(fontSpecsOf(design));

  const canvas = target ?? document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء سياق الرسم');

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  if (design.backgroundUrl) {
    const img = await loadImage(design.backgroundUrl);
    drawCover(ctx, img, W, H);
  }

  for (const extra of design.extras ?? []) {
    if (extra.text?.trim()) drawTextLayer(ctx, extra, extra.text, W, H);
  }

  drawTextLayer(ctx, design.name, guestName, W, H);
  await drawQr(ctx, code, design, W, H);

  return canvas;
}

/** يغطي الكانفس بالصورة مع الحفاظ على نسبة الأبعاد (object-fit: cover) */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('تعذّر تحويل الصورة'))),
      'image/jpeg',
      quality,
    );
  });
}

/** اسم ملف آمن مبني على اسم المدعو */
export function safeFileName(name: string, index: number): string {
  const clean = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .trim();
  return `${String(index + 1).padStart(3, '0')}-${clean || 'مدعو'}.jpg`;
}

/**
 * فحص تباين ألوان الباركود.
 *
 * قارئات QR تعتمد على تباين السطوع بين الوحدات الداكنة والفاتحة.
 * المعيار العملي: نسبة تباين ≥ 7:1 آمنة، و 4.5:1 حدية، وأقل من ذلك غير موثوقة.
 * كذلك يجب أن تكون الوحدات أغمق من الخلفية — القارئات لا تتوقع باركود معكوساً.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** السطوع النسبي وفق WCAG */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export type ScanRisk = 'safe' | 'warning' | 'danger';

export interface ContrastVerdict {
  ratio: number;
  risk: ScanRisk;
  message: string;
  inverted: boolean;
}

/**
 * @param foreground لون وحدات الباركود
 * @param background خلفية الباركود ('transparent' يعني أن خلفية التصميم هي الظاهرة)
 * @param behind لون التصميم خلف الباركود — يُستخدم عند الخلفية الشفافة
 */
export function checkQrContrast(
  foreground: string,
  background: string,
  behind = '#FFFFFF',
): ContrastVerdict {
  const effectiveBg = background === 'transparent' ? behind : background;
  const ratio = contrastRatio(foreground, effectiveBg);
  const inverted = relativeLuminance(foreground) > relativeLuminance(effectiveBg);

  if (inverted && ratio >= 4.5) {
    return {
      ratio,
      inverted,
      risk: 'warning',
      message:
        'الباركود أفتح من خلفيته (معكوس). بعض تطبيقات الكاميرا لا تقرأ الباركود المعكوس — يُفضّل لون داكن على خلفية فاتحة.',
    };
  }

  if (ratio < 3) {
    return {
      ratio,
      inverted,
      risk: 'danger',
      message:
        'التباين ضعيف جداً — الباركود غالباً لن يُقرأ بالكاميرا. غيّر اللون أو الخلفية.',
    };
  }

  if (ratio < 7) {
    return {
      ratio,
      inverted,
      risk: 'warning',
      message:
        'التباين حدّي — قد يتعثّر المسح في الإضاءة الخافتة داخل القاعة. يُنصح بلون أغمق.',
    };
  }

  if (background === 'transparent') {
    return {
      ratio,
      inverted,
      risk: 'warning',
      message:
        'الخلفية شفافة: تأكد أن مكان الباركود على التصميم لونه ثابت وفاتح، لأن أي زخرفة خلفه تُربك القارئ.',
    };
  }

  return { ratio, inverted, risk: 'safe', message: 'التباين ممتاز — الباركود سيُقرأ بوضوح.' };
}

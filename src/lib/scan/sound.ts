import type { CheckinResult } from '@/lib/types/database';

/**
 * تنبيه صوتي قصير لنتيجة المسح.
 *
 * القاعات صاخبة والمسؤول لا ينظر للشاشة دائماً، فالنغمة تخبره بالنتيجة
 * قبل أن يقرأ. نولّدها بـ Web Audio بدل ملفات صوتية حتى لا نُحمّل شيئاً
 * على شبكة القاعة الضعيفة.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    context ??= new Ctor();
    // متصفحات الجوال تُعلّق السياق حتى أول تفاعل من المستخدم
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function beep(ctx: AudioContext, frequency: number, startAt: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // تلاشٍ سريع يمنع الطقطقة عند بداية النغمة ونهايتها
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.22, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/** نغمة مميّزة لكل نتيجة: صاعدة للنجاح، منخفضة مكرّرة للرفض */
export function playScanTone(result: CheckinResult) {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (result) {
    case 'granted':
      beep(ctx, 880, now, 0.09);
      beep(ctx, 1320, now + 0.1, 0.13);
      break;
    case 'override':
      beep(ctx, 660, now, 0.1);
      beep(ctx, 880, now + 0.11, 0.12);
      break;
    case 'duplicate':
      beep(ctx, 320, now, 0.13);
      beep(ctx, 240, now + 0.16, 0.2);
      break;
    default:
      beep(ctx, 200, now, 0.28);
  }
}

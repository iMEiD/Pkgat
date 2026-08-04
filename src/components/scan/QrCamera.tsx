'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';

type CameraState = 'idle' | 'starting' | 'running' | 'denied' | 'unsupported' | 'error';

/**
 * قارئ QR يعمل من متصفح الجوال مباشرة عبر getUserMedia + jsQR.
 *
 * مضبوط للعمل داخل القاعات: دقة معتدلة (تكفي للقراءة وتخفّف المعالجة)،
 * وكاميرا خلفية افتراضياً، ومعدل فحص ~١٠ إطارات بالثانية بدل كل إطار
 * حتى لا تستهلك بطارية الجهاز.
 */
export function QrCamera({
  onDetected,
  paused,
}: {
  onDetected: (code: string) => void;
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanAt = useRef(0);
  const pausedRef = useRef(Boolean(paused));

  const [state, setState] = useState<CameraState>('idle');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  useEffect(() => {
    pausedRef.current = Boolean(paused);
  }, [paused]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }

      setState('starting');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
        setHasTorch(Boolean(capabilities?.torch));

        setState('running');
        void loop();
      } catch (err) {
        if (cancelled) return;
        const name = (err as Error).name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      }
    }

    async function loop() {
      const jsQR = (await import('jsqr')).default;

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);

        const video = videoRef.current;
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;
        if (pausedRef.current) return;

        const now = performance.now();
        if (now - lastScanAt.current < 100) return;
        lastScanAt.current = now;

        const canvas = (canvasRef.current ??= document.createElement('canvas'));
        // نفحص نسخة مصغّرة: أسرع بكثير وتكفي تماماً لقراءة QR
        const scale = Math.min(1, 640 / (video.videoWidth || 640));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        if (canvas.width === 0 || canvas.height === 0) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code?.data) onDetected(code.data.trim());
      };

      rafRef.current = requestAnimationFrame(tick);
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onDetected]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn((v) => !v);
    } catch {
      setHasTorch(false);
    }
  }

  return (
    <div className="relative h-full min-h-[52vh] w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-full w-full object-cover"
        aria-label="كاميرا مسح الباركود"
      />

      {/* إطار التوجيه */}
      {state === 'running' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={`relative aspect-square w-[62%] max-w-[300px] rounded-3xl border-2 transition-colors duration-300 ${
              paused ? 'border-white/25' : 'border-white/70'
            }`}
          >
            <Corner className="right-0 top-0 rounded-tr-3xl border-r-4 border-t-4" />
            <Corner className="left-0 top-0 rounded-tl-3xl border-l-4 border-t-4" />
            <Corner className="bottom-0 right-0 rounded-br-3xl border-b-4 border-r-4" />
            <Corner className="bottom-0 left-0 rounded-bl-3xl border-b-4 border-l-4" />
            {!paused && (
              <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse rounded-full bg-mint-300/80" />
            )}
          </div>
          <p className="absolute bottom-6 text-xs font-semibold text-white/70">
            {paused ? 'المسح متوقف مؤقتاً' : 'وجّه الكاميرا نحو الباركود'}
          </p>
        </div>
      )}

      {hasTorch && state === 'running' && (
        <button
          type="button"
          onClick={toggleTorch}
          className={`absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-2xl backdrop-blur transition-colors ${
            torchOn ? 'bg-sunny-500 text-ink' : 'bg-black/40 text-white'
          }`}
          aria-label="الإضاءة"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 2h6l-1 6h4l-8 14 2-9H8l1-11Z" />
          </svg>
        </button>
      )}

      {state !== 'running' && (
        <div className="absolute inset-0 grid place-items-center bg-ink/95 p-6 text-center">
          <div className="max-w-xs">
            {state === 'starting' && (
              <p className="text-sm text-white/70">جاري تشغيل الكاميرا…</p>
            )}

            {state === 'denied' && (
              <>
                <p className="text-3xl">📷</p>
                <h2 className="mt-3 font-display text-lg font-black text-white">
                  الكاميرا محجوبة
                </h2>
                <p className="mt-2 text-sm leading-7 text-white/65">
                  اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح، ثم أعد تحميل الصفحة. تقدر
                  مؤقتاً تستخدم «إدخال يدوي» بالأسفل.
                </p>
                <Button className="mt-4" onClick={() => window.location.reload()}>
                  أعد المحاولة
                </Button>
              </>
            )}

            {state === 'unsupported' && (
              <>
                <p className="text-3xl">🚫</p>
                <h2 className="mt-3 font-display text-lg font-black text-white">
                  المتصفح لا يدعم الكاميرا
                </h2>
                <p className="mt-2 text-sm leading-7 text-white/65">
                  افتح الرابط في Safari أو Chrome على الجوال — ولاحظ أن الكاميرا تتطلب اتصالاً
                  آمناً (https).
                </p>
              </>
            )}

            {state === 'error' && (
              <>
                <p className="text-3xl">⚠️</p>
                <h2 className="mt-3 font-display text-lg font-black text-white">
                  تعذّر تشغيل الكاميرا
                </h2>
                <p className="mt-2 text-sm leading-7 text-white/65">
                  قد تكون الكاميرا مستخدمة في تطبيق آخر. أغلق التطبيقات الأخرى وأعد المحاولة.
                </p>
                <Button className="mt-4" onClick={() => window.location.reload()}>
                  أعد المحاولة
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute h-7 w-7 border-mint-300 ${className}`} />;
}

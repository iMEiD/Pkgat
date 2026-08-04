'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { renderInvitation } from '@/lib/design/render';
import type { DesignConfig } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export type DragTarget = 'name' | 'qr' | null;

/** حدود حجم كل طبقة كنسبة من عرض التصميم */
const SIZE_LIMITS = {
  name: { min: 0.01, max: 0.3 },
  qr: { min: 0.05, max: 0.6 },
} as const;

interface ActiveGesture {
  target: 'name' | 'qr';
  /** المسافة بين الإصبعين عند بداية القرص */
  startDistance: number;
  /** حجم الطبقة عند بداية القرص */
  startSize: number;
  /** نقطة المنتصف بين الإصبعين عند البداية (نسبية) */
  startMidX: number;
  startMidY: number;
  /** موضع الطبقة عند البداية */
  startX: number;
  startY: number;
}

/**
 * معاينة حية للدعوة مع تحكّم كامل بموضع وحجم اسم المدعو والباركود.
 *
 * - إصبع واحد: تحريك.
 * - إصبعان: تكبير وتصغير مع التحريك في نفس الوقت (pinch).
 * - الأسهم: تحريك دقيق، ومع Shift خطوات أكبر.
 *
 * الرسم يمر دائماً عبر renderInvitation التي تنتظر تحميل الخطوط قبل الرسم،
 * فالمعاينة تعكس الخط المختار فعلاً وليس خطاً بديلاً.
 */
export function InvitationPreview({
  design,
  sampleCode,
  onMove,
  onResize,
  selected,
  onSelect,
  className,
}: {
  design: DesignConfig;
  sampleCode: string;
  onMove?: (target: 'name' | 'qr', x: number, y: number) => void;
  /** الحجم الجديد كنسبة مطلقة من عرض التصميم */
  onResize?: (target: 'name' | 'qr', size: number) => void;
  selected?: DragTarget;
  onSelect?: (target: DragTarget) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [pinching, setPinching] = useState(false);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);

  /** كل الأصابع النشطة على المقبض الحالي */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<ActiveGesture | null>(null);
  /** أحدث تصميم — نقرأه داخل المستمعات بلا إعادة تسجيلها */
  const designRef = useRef(design);
  designRef.current = design;

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const token = ++renderToken.current;
    setRendering(true);
    try {
      await renderInvitation(
        { design, guestName: design.name.sample || 'اسم المدعو', code: sampleCode },
        canvas,
      );
    } catch {
      // خلفية مفقودة أو تعذّر تحميلها — نبقي المعاينة كما هي
    } finally {
      // نتجاهل نتيجة أي رسم قديم تجاوزه رسم أحدث
      if (token === renderToken.current) setRendering(false);
    }
  }, [design, sampleCode]);

  useEffect(() => {
    void draw();
  }, [draw]);

  const relativePos = useCallback((clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const layerSize = (target: 'name' | 'qr') =>
    target === 'name' ? designRef.current.name.fontSize : designRef.current.qr.size;

  const layerPos = (target: 'name' | 'qr') => {
    const layer = target === 'name' ? designRef.current.name : designRef.current.qr;
    return { x: layer.x, y: layer.y };
  };

  /** يبدأ قرصة عندما يصبح عدد الأصابع اثنين */
  const beginPinch = useCallback(
    (target: 'name' | 'qr' | null) => {
      if (!target) return;
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;

      const rect = wrapRef.current!.getBoundingClientRect();
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const pos = layerPos(target);

      gesture.current = {
        target,
        startDistance: Math.max(1, Math.hypot(dx, dy)),
        startSize: layerSize(target),
        startMidX: (a.x + b.x) / 2 / rect.width,
        startMidY: (a.y + b.y) / 2 / rect.height,
        startX: pos.x,
        startY: pos.y,
      };
      setPinching(true);
    },
    [],
  );

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      e.preventDefault();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const target = dragging;
      const active = [...pointers.current.values()];

      // إصبعان: تكبير/تصغير مع التحريك
      if (active.length >= 2 && gesture.current?.target === target) {
        const [a, b] = active;
        const rect = wrapRef.current!.getBoundingClientRect();
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const g = gesture.current;

        if (onResize) {
          const limits = SIZE_LIMITS[target];
          const next = g.startSize * (distance / g.startDistance);
          onResize(target, Math.min(limits.max, Math.max(limits.min, next)));
        }

        if (onMove) {
          const midX = (a.x + b.x) / 2 / rect.width;
          const midY = (a.y + b.y) / 2 / rect.height;
          onMove(
            target,
            Math.min(1, Math.max(0, g.startX + (midX - g.startMidX))),
            Math.min(1, Math.max(0, g.startY + (midY - g.startMidY))),
          );
        }
        return;
      }

      // إصبع واحد: تحريك فقط
      if (onMove) {
        const { x, y } = relativePos(e.clientX, e.clientY);
        onMove(target, x, y);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);

      if (pointers.current.size < 2) {
        gesture.current = null;
        setPinching(false);
      }
      if (pointers.current.size === 0) setDragging(null);
    };

    /*
     * الإصبع الثاني يُلتقط من كامل مساحة المعاينة لا من المقبض وحده.
     * مقبض الباركود صغير (قد يكون ١٢٪ من العرض)، فاشتراط نزول الإصبعين
     * فوقه كان يجعل القرص شبه مستحيل عليه بينما ينجح مع الاسم الأعرض.
     */
    const onExtraPointerDown = (e: PointerEvent) => {
      if (pointers.current.has(e.pointerId)) return;
      if (!wrapRef.current?.contains(e.target as Node)) return;

      e.preventDefault();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) beginPinch(dragging);
    };

    window.addEventListener('pointerdown', onExtraPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointerdown', onExtraPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragging, onMove, onResize, relativePos, beginPinch]);

  function onHandlePointerDown(e: React.PointerEvent, target: 'name' | 'qr') {
    e.preventDefault();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(target);
    onSelect?.(target);

    if (pointers.current.size === 2) beginPinch(target);
  }

  /** تحريك وتحجيم دقيق بلوحة المفاتيح */
  function onHandleKeyDown(e: React.KeyboardEvent, target: 'name' | 'qr') {
    const step = e.shiftKey ? 0.02 : 0.005;

    // + و − لتغيير الحجم
    if ((e.key === '+' || e.key === '=' || e.key === '-') && onResize) {
      e.preventDefault();
      const limits = SIZE_LIMITS[target];
      const factor = e.key === '-' ? 0.94 : 1.06;
      onResize(target, Math.min(limits.max, Math.max(limits.min, layerSize(target) * factor)));
      return;
    }

    if (!onMove) return;
    const layer = target === 'name' ? design.name : design.qr;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      // في RTL يبقى السهم الأيسر يعني تقليل الإحداثي الأفقي
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const move = moves[e.key];
    if (!move) return;

    e.preventDefault();
    onMove(
      target,
      Math.min(1, Math.max(0, layer.x + move[0])),
      Math.min(1, Math.max(0, layer.y + move[1])),
    );
  }

  const interactive = Boolean(onMove);

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative w-full touch-none select-none overflow-hidden rounded-3xl border border-sand-200 bg-sand-50 shadow-soft',
        className,
      )}
      style={{ aspectRatio: `${design.width} / ${design.height}` }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {!design.backgroundUrl && (
        <div className="absolute inset-0 grid place-items-center bg-sand-50/80 p-6 text-center">
          <p className="text-sm font-semibold text-ink-soft">
            اختر قالباً جاهزاً أو ارفع تصميمك لتظهر المعاينة
          </p>
        </div>
      )}

      {interactive && design.backgroundUrl && (
        <>
          <Handle
            label="اسم المدعو"
            x={design.name.x}
            y={design.name.y}
            active={selected === 'name'}
            dragging={dragging === 'name'}
            tone="grape"
            onPointerDown={(e) => onHandlePointerDown(e, 'name')}
            onKeyDown={(e) => onHandleKeyDown(e, 'name')}
          />
          {design.qr.visible && (
            <Handle
              label="الباركود"
              x={design.qr.x}
              y={design.qr.y}
              active={selected === 'qr'}
              dragging={dragging === 'qr'}
              tone="coral"
              boxSize={design.qr.size}
              onPointerDown={(e) => onHandlePointerDown(e, 'qr')}
              onKeyDown={(e) => onHandleKeyDown(e, 'qr')}
            />
          )}
        </>
      )}

      {pinching && (
        <span className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-ink/75 px-3 py-1 text-[11px] font-bold text-white">
          {dragging === 'qr'
            ? `حجم الباركود ${Math.round(design.qr.size * 100)}٪`
            : `حجم الخط ${(design.name.fontSize * 100).toFixed(1)}٪`}
        </span>
      )}

      {rendering && !pinching && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white">
          جاري الرسم…
        </span>
      )}
    </div>
  );
}

function Handle({
  label,
  x,
  y,
  active,
  dragging,
  tone,
  boxSize,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  x: number;
  y: number;
  active?: boolean;
  dragging?: boolean;
  tone: 'grape' | 'coral';
  boxSize?: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const colors =
    tone === 'grape' ? 'border-grape-500 bg-grape-500/10' : 'border-coral-500 bg-coral-500/10';
  const chip = tone === 'grape' ? 'bg-grape-500' : 'bg-coral-500';

  return (
    <button
      type="button"
      aria-label={`تحريك وتحجيم ${label}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute touch-none rounded-xl border-2 border-dashed transition-opacity',
        colors,
        dragging ? 'cursor-grabbing opacity-100' : 'cursor-grab',
        active ? 'opacity-100' : 'opacity-70 hover:opacity-100',
      )}
      style={{
        // في اتجاه RTL نستخدم left صراحةً لأن الإحداثي محسوب من اليسار
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: boxSize ? `${boxSize * 100}%` : '46%',
        aspectRatio: boxSize ? '1 / 1' : undefined,
        height: boxSize ? undefined : '11%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span
        className={cn(
          'absolute -top-6 right-1/2 translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold text-white',
          chip,
        )}
      >
        {label}
      </span>
    </button>
  );
}

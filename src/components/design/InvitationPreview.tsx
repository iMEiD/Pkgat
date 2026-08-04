'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { renderInvitation } from '@/lib/design/render';
import type { DesignConfig } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export type DragTarget = 'name' | 'qr' | null;

/**
 * معاينة حية للدعوة مع مقابض سحب لموضع الاسم والباركود.
 *
 * الرسم يمر دائماً عبر renderInvitation، وهي تنتظر تحميل الخطوط قبل
 * الرسم — فالمعاينة تعكس الخط المختار فعلاً وليس خطاً بديلاً.
 */
export function InvitationPreview({
  design,
  sampleCode,
  onMove,
  selected,
  onSelect,
  className,
}: {
  design: DesignConfig;
  sampleCode: string;
  onMove?: (target: 'name' | 'qr', x: number, y: number) => void;
  selected?: DragTarget;
  onSelect?: (target: DragTarget) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [rendering, setRendering] = useState(false);
  const renderToken = useRef(0);

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

  function relativePos(clientX: number, clientY: number) {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  useEffect(() => {
    if (!dragging || !onMove) return;

    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const { x, y } = relativePos(e.clientX, e.clientY);
      onMove(dragging, x, y);
    };
    const stop = () => setDragging(null);

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, onMove]);

  /** تحريك دقيق بالأسهم لمن يستخدم لوحة المفاتيح */
  function onHandleKeyDown(e: React.KeyboardEvent, target: 'name' | 'qr') {
    if (!onMove) return;
    const step = e.shiftKey ? 0.02 : 0.005;
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
        'relative w-full overflow-hidden rounded-3xl border border-sand-200 bg-sand-50 shadow-soft',
        className,
      )}
      style={{ aspectRatio: `${design.width} / ${design.height}` }}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" />

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
            onPointerDown={() => {
              setDragging('name');
              onSelect?.('name');
            }}
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
              onPointerDown={() => {
                setDragging('qr');
                onSelect?.('qr');
              }}
              onKeyDown={(e) => onHandleKeyDown(e, 'qr')}
            />
          )}
        </>
      )}

      {rendering && (
        <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white">
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
  onPointerDown: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const colors =
    tone === 'grape'
      ? 'border-grape-500 bg-grape-500/10'
      : 'border-coral-500 bg-coral-500/10';
  const chip = tone === 'grape' ? 'bg-grape-500' : 'bg-coral-500';

  return (
    <button
      type="button"
      aria-label={`تحريك ${label}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPointerDown();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 touch-none rounded-xl border-2 border-dashed transition-opacity',
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
